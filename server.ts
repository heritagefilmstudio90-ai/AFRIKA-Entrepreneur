import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import {
  canManageEvent,
  canMessageRecipient,
  canRegisterForEvent,
  computeSubscriptionDates,
  hasActiveSubscription,
  isBlockedBetween,
  sanitizeEventForUser,
  sanitizeGroupForUser,
  sanitizeNetworkForUser,
  sanitizeOpportunityForUser,
  SUBSCRIPTION_PRICING,
} from './src/lib/accessRules';
import { buildIcsCalendar, selectEventsForCalendarSync } from './src/lib/calendarSync';
import { buildNetworkingTrends30Days } from './src/lib/networkingTrends';
import { runPythonEngine } from './server/pythonBridge';
import {
  loadDb,
  saveDb,
  stripSecretMemberFields,
  verifyPassword,
  hashPassword,
  type StoredMember,
} from './server/store';
import type {
  AppNotification,
  BusinessEvent,
  BusinessOpportunity,
  ContactConnection,
  DirectoryEntry,
  EncryptedMessageRecord,
  EventParticipantSummary,
  EventRegistration,
  GroupMessage,
  ModerationReport,
  PaymentRecord,
  ProfessionalNetwork,
  ScannedBadgeContact,
  SubscriptionEventLog,
  SubscriptionPlan,
} from './src/types/domain';

const PORT = process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 3000 : 3000;
const app = express();
app.use(express.json({ limit: '15mb' }));

// Rate limiting for login attempts (§12.3)
const failedLogins = new Map<string, { count: number; resetAt: number }>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// WebSocket connection registry by userId
const wsClientsByUser = new Map<string, Set<WebSocket>>();

function broadcastToUser(userId: string, eventType: string, payload: unknown) {
  const sockets = wsClientsByUser.get(userId);
  if (!sockets) return;
  const serialized = JSON.stringify({ type: eventType, payload, ts: Date.now() });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

function broadcastToAll(eventType: string, payload: unknown) {
  const serialized = JSON.stringify({ type: eventType, payload, ts: Date.now() });
  for (const sockets of wsClientsByUser.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }
}

function getOnlineUserIds(): string[] {
  const ids: string[] = [];
  for (const [uid, set] of wsClientsByUser.entries()) {
    if (set.size > 0) ids.push(uid);
  }
  return ids;
}

interface AuthedRequest extends Request {
  member?: StoredMember;
}

async function resolveSession(req: AuthedRequest, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    const db = await loadDb();
    const session = db.sessions.find((s) => s.token === token);
    if (session && new Date(session.expiresAt).getTime() > Date.now()) {
      const member = db.members.find((m) => m.id === session.userId);
      if (member) {
        req.member = member;
      }
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.member) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  if (req.member.suspended) {
    res.status(403).json({ error: 'Ce compte a été suspendu par la modération.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.member || req.member.role !== 'admin') {
    res.status(403).json({ error: 'Accès réservé aux administrateurs et modérateurs.' });
    return;
  }
  next();
}

function requireOrganizerOrAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.member || (req.member.role !== 'organizer' && req.member.role !== 'admin')) {
    res.status(403).json({ error: 'Accès réservé aux organisateurs et administrateurs.' });
    return;
  }
  next();
}

app.use('/api', resolveSession);

// --- Health & Demo Quick-Login Directory (for testing multi-user / role transitions) ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'africa-entrepreneur', onlineUsers: getOnlineUserIds().length });
});

app.get('/api/auth/demo-accounts', async (_req, res) => {
  const db = await loadDb();
  const demoEmails = [
    'amina@africaentrepreneur.com',
    'kwame@africaentrepreneur.com',
    'moussa@africaentrepreneur.com',
    'orga@africaentrepreneur.com',
    'admin@africaentrepreneur.com',
  ];
  const accounts = db.members
    .filter((m) => demoEmails.includes(m.email))
    .map((m) => ({
      id: m.id,
      email: m.email,
      fullName: m.fullName,
      role: m.role,
      subscriptionStatus: m.subscriptionStatus,
      subscriptionPlan: m.subscriptionPlan,
      city: m.city,
      country: m.country,
      avatarUrl: m.avatarUrl,
    }));
  res.json({ accounts });
});

// --- Auth Routes (FR-01, §12.3) ---
app.post('/api/auth/register', async (req, res) => {
  const {
    email,
    password,
    fullName,
    country = 'Sénégal',
    city = 'Dakar',
    language = 'fr',
    publicKeyJwk,
    wrappedPrivateKey,
    keyFingerprint,
  } = req.body ?? {};

  if (!email || !password || !fullName) {
    res.status(400).json({ error: 'Courriel, mot de passe et nom complet sont requis.' });
    return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    return;
  }

  const db = await loadDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (db.members.some((m) => m.email.toLowerCase() === normalizedEmail)) {
    res.status(409).json({ error: 'Un compte existe déjà avec cette adresse courriel.' });
    return;
  }

  const { hash, salt } = hashPassword(String(password));
  const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
  const id = `u-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const newMember: StoredMember = {
    id,
    email: normalizedEmail,
    emailVerified: false,
    verificationCode,
    fullName: String(fullName).trim(),
    role: 'personnel',
    subscriptionStatus: 'none',
    country: String(country).trim(),
    city: String(city).trim(),
    language: language === 'en' ? 'en' : 'fr',
    publicKeyJwk,
    wrappedPrivateKey,
    keyFingerprint,
    visibility: 'private',
    notificationsEnabled: true,
    createdAt: now,
    passwordHash: hash,
    passwordSalt: salt,
  };

  db.members.push(newMember);
  db.profiles.push({
    memberId: id,
    headline: 'Membre Africa Entrepreneur',
    bio: '',
    sectors: [],
    skills: [],
    activeCountries: [newMember.country],
    languages: [newMember.language === 'fr' ? 'Français' : 'Anglais'],
    collaborationNeeds: [],
    updatedAt: now,
  });

  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({
    token,
    userId: id,
    createdAt: now,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
  });
  saveDb(db);

  res.status(201).json({
    token,
    user: stripSecretMemberFields(newMember),
    verificationHintCode: verificationCode,
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    res.status(400).json({ error: 'Courriel et mot de passe requis.' });
    return;
  }

  const nowMs = Date.now();
  const rate = failedLogins.get(normalizedEmail);
  if (rate && rate.resetAt > nowMs && rate.count >= 5) {
    res.status(429).json({
      error: 'Trop de tentatives échouées. Réessayez dans quelques minutes.',
    });
    return;
  }

  const db = await loadDb();
  const member = db.members.find((m) => m.email.toLowerCase() === normalizedEmail);
  if (!member || !verifyPassword(String(password), member.passwordHash, member.passwordSalt)) {
    const nextCount = rate && rate.resetAt > nowMs ? rate.count + 1 : 1;
    failedLogins.set(normalizedEmail, { count: nextCount, resetAt: nowMs + 5 * 60 * 1000 });
    res.status(401).json({ error: 'Identifiants invalides.' });
    return;
  }

  if (member.suspended) {
    res.status(403).json({ error: 'Compte suspendu par la modération.' });
    return;
  }

  failedLogins.delete(normalizedEmail);
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  db.sessions.push({
    token,
    userId: member.id,
    createdAt: now,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
  });
  saveDb(db);

  res.json({
    token,
    user: stripSecretMemberFields(member),
  });
});

app.post('/api/auth/verify-email', requireAuth, async (req: AuthedRequest, res) => {
  const { code } = req.body ?? {};
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.member!.id);
  if (!m) {
    res.status(404).json({ error: 'Membre introuvable.' });
    return;
  }
  if (m.emailVerified) {
    res.json({ user: stripSecretMemberFields(m) });
    return;
  }
  if (!code || String(code).trim() !== m.verificationCode) {
    res.status(400).json({ error: 'Code de vérification incorrect.' });
    return;
  }
  m.emailVerified = true;
  delete m.verificationCode;
  saveDb(db);
  res.json({ user: stripSecretMemberFields(m) });
});

app.post('/api/auth/recover', async (req, res) => {
  const { email, newPassword } = req.body ?? {};
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    res.status(400).json({ error: 'Adresse courriel requise.' });
    return;
  }
  const db = await loadDb();
  const member = db.members.find((m) => m.email.toLowerCase() === normalized);
  if (member && newPassword && String(newPassword).length >= 6) {
    const { hash, salt } = hashPassword(String(newPassword));
    member.passwordHash = hash;
    member.passwordSalt = salt;
    saveDb(db);
  }
  res.json({
    ok: true,
    message: 'Si ce courriel correspond à un compte existant, la procédure de récupération a été appliquée.',
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    const db = await loadDb();
    db.sessions = db.sessions.filter((s) => s.token !== token);
    saveDb(db);
  }
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.member!.id)!;
  const profile = db.profiles.find((p) => p.memberId === m.id) || null;
  const enterprise = db.enterprises.find((e) => e.ownerId === m.id) || null;
  const registrations = db.registrations.filter((r) => r.memberId === m.id && r.status === 'confirmed');
  const payments = db.payments
    .filter((p) => p.memberId === m.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const subscriptionLogs = db.subscriptionLogs
    .filter((l) => l.memberId === m.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notifications = db.notifications
    .filter((n) => n.memberId === m.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const blocks = db.blocks
    .filter((b) => b.blockerId === m.id)
    .map((b) => ({
      ...b,
      blockedName: db.members.find((x) => x.id === b.blockedId)?.fullName || 'Membre',
    }));

  res.json({
    user: stripSecretMemberFields(m),
    profile,
    enterprise,
    registrations,
    payments,
    subscriptionLogs,
    notifications,
    blocks,
    visibilityStats: {
      profileViews: m.profileViews || 0,
      enterpriseViews: enterprise?.viewsCount || 0,
    },
    onlineUsers: getOnlineUserIds(),
  });
});

// §12.3 Data portability export (JSON) & account deletion
app.get('/api/me/export', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.member!.id)!;
  const exportBundle = {
    exportedAt: new Date().toISOString(),
    account: stripSecretMemberFields(m),
    profile: db.profiles.find((p) => p.memberId === m.id) || null,
    enterprise: db.enterprises.find((e) => e.ownerId === m.id) || null,
    registrations: db.registrations.filter((r) => r.memberId === m.id),
    payments: db.payments.filter((p) => p.memberId === m.id),
    subscriptionLogs: db.subscriptionLogs.filter((l) => l.memberId === m.id),
    connections: db.connections.filter((c) => c.senderId === m.id || c.recipientId === m.id),
    opportunities: db.opportunities.filter((o) => o.authorId === m.id),
  };
  res.json(exportBundle);
});

app.get('/api/me/calendar.ics', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.member!.id);
  if (!m) {
    res.status(404).json({ error: 'Membre introuvable.' });
    return;
  }
  const regs = db.registrations.filter((r) => r.memberId === m.id && r.status === 'confirmed');
  const sanitizedEvents = db.events
    .filter((ev) => ev.status === 'published' || m.role === 'admin')
    .map((ev) => {
      const isReg = regs.some((r) => r.eventId === ev.id);
      return sanitizeEventForUser(ev, m, isReg);
    });
  const scope = m.calendarSyncScope || 'all_saved';
  const items = selectEventsForCalendarSync({
    events: sanitizedEvents,
    registrations: regs,
    favoriteEventIds: Array.isArray(m.favoriteEventIds) ? m.favoriteEventIds : [],
    scope,
  });
  const ics = buildIcsCalendar(items, {
    calendarName: `Africa Entrepreneur — ${m.fullName}`,
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="africa-entrepreneur-agenda.ics"');
  res.send(ics);
});

app.delete('/api/me', requireAuth, async (req: AuthedRequest, res) => {
  const { password } = req.body ?? {};
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.member!.id);
  if (!m) {
    res.status(404).json({ error: 'Compte introuvable.' });
    return;
  }
  if (!password || !verifyPassword(String(password), m.passwordHash, m.passwordSalt)) {
    res.status(403).json({ error: 'Mot de passe requis pour supprimer définitivement votre compte.' });
    return;
  }
  if (m.role === 'admin') {
    res.status(403).json({ error: 'Le compte administrateur principal ne peut pas être auto-supprimé.' });
    return;
  }
  const uid = m.id;
  db.members = db.members.filter((x) => x.id !== uid);
  db.profiles = db.profiles.filter((p) => p.memberId !== uid);
  db.enterprises = db.enterprises.filter((e) => e.ownerId !== uid);
  db.registrations = db.registrations.filter((r) => r.memberId !== uid);
  db.connections = db.connections.filter((c) => c.senderId !== uid && c.recipientId !== uid);
  db.blocks = db.blocks.filter((b) => b.blockerId !== uid && b.blockedId !== uid);
  db.sessions = db.sessions.filter((s) => s.userId !== uid);
  db.notifications = db.notifications.filter((n) => n.memberId !== uid);
  saveDb(db);
  res.json({ ok: true });
});

app.put('/api/me/keys', requireAuth, async (req: AuthedRequest, res) => {
  const { publicKeyJwk, wrappedPrivateKey, keyFingerprint } = req.body ?? {};
  if (!publicKeyJwk || !keyFingerprint) {
    res.status(400).json({ error: 'Clé publique et empreinte requises.' });
    return;
  }
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.member!.id)!;
  m.publicKeyJwk = publicKeyJwk;
  if (wrappedPrivateKey) m.wrappedPrivateKey = wrappedPrivateKey;
  m.keyFingerprint = keyFingerprint;
  saveDb(db);
  res.json({ user: stripSecretMemberFields(m) });
});

// --- Profile, Settings & Enterprise (FR-02, FR-03, FR-04) ---
app.put('/api/me/profile', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.member!.id)!;
  const {
    fullName,
    country,
    city,
    language,
    visibility,
    notificationsEnabled,
    favoriteReminderEnabled,
    calendarSyncEnabled,
    calendarSyncScope,
    calendarLastSyncedAt,
    avatarUrl,
    headline,
    bio,
    sectors,
    skills,
    activeCountries,
    languages,
    collaborationNeeds,
    voicePitchDataUrl,
    voicePitchTranscript,
  } = req.body ?? {};

  if (fullName) m.fullName = String(fullName).trim();
  if (country) m.country = String(country).trim();
  if (city) m.city = String(city).trim();
  if (language === 'fr' || language === 'en') m.language = language;
  if (visibility === 'public_subscribers' || visibility === 'connections_only' || visibility === 'private') {
    m.visibility = visibility;
  }
  if (typeof notificationsEnabled === 'boolean') m.notificationsEnabled = notificationsEnabled;
  if (typeof favoriteReminderEnabled === 'boolean') m.favoriteReminderEnabled = favoriteReminderEnabled;
  if (typeof calendarSyncEnabled === 'boolean') m.calendarSyncEnabled = calendarSyncEnabled;
  if (
    calendarSyncScope === 'all_saved' ||
    calendarSyncScope === 'registered_only' ||
    calendarSyncScope === 'favorites_only'
  ) {
    m.calendarSyncScope = calendarSyncScope;
  }
  if (typeof calendarLastSyncedAt === 'string' && calendarLastSyncedAt) {
    m.calendarLastSyncedAt = calendarLastSyncedAt;
  }
  if (typeof avatarUrl === 'string') m.avatarUrl = avatarUrl;

  const now = new Date().toISOString();
  let profile = db.profiles.find((p) => p.memberId === m.id);
  if (!profile) {
    profile = {
      memberId: m.id,
      headline: '',
      bio: '',
      sectors: [],
      skills: [],
      activeCountries: [],
      languages: [],
      collaborationNeeds: [],
      updatedAt: now,
    };
    db.profiles.push(profile);
  }
  if (typeof headline === 'string') profile.headline = headline;
  if (typeof bio === 'string') profile.bio = bio;
  if (Array.isArray(sectors)) profile.sectors = sectors;
  if (Array.isArray(skills)) profile.skills = skills;
  if (Array.isArray(activeCountries)) profile.activeCountries = activeCountries;
  if (Array.isArray(languages)) profile.languages = languages;
  if (Array.isArray(collaborationNeeds)) profile.collaborationNeeds = collaborationNeeds;
  if (typeof voicePitchDataUrl === 'string') profile.voicePitchDataUrl = voicePitchDataUrl;
  if (typeof voicePitchTranscript === 'string') profile.voicePitchTranscript = voicePitchTranscript;
  profile.updatedAt = now;

  saveDb(db);
  res.json({ user: stripSecretMemberFields(m), profile });
});

app.put('/api/me/enterprise', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const { name, description, sector, country, city, services, logoUrl, websiteUrl, linkedinUrl } = req.body ?? {};
  if (!name || !sector) {
    res.status(400).json({ error: 'Le nom et le secteur de l’entreprise sont requis.' });
    return;
  }
  let ent = db.enterprises.find((e) => e.ownerId === req.member!.id);
  if (!ent) {
    ent = {
      id: `ent-${crypto.randomUUID().slice(0, 8)}`,
      ownerId: req.member!.id,
      name: String(name),
      description: String(description || ''),
      sector: String(sector),
      country: String(country || req.member!.country),
      city: String(city || req.member!.city),
      services: Array.isArray(services) ? services : [],
      logoUrl,
      websiteUrl,
      linkedinUrl,
      verified: false,
    };
    db.enterprises.push(ent);
  } else {
    ent.name = String(name);
    ent.description = String(description || '');
    ent.sector = String(sector);
    ent.country = String(country || ent.country);
    ent.city = String(city || ent.city);
    if (Array.isArray(services)) ent.services = services;
    if (typeof logoUrl === 'string') ent.logoUrl = logoUrl;
    if (typeof websiteUrl === 'string') ent.websiteUrl = websiteUrl;
    if (typeof linkedinUrl === 'string') ent.linkedinUrl = linkedinUrl;
  }
  saveDb(db);
  res.json({ enterprise: ent });
});

// --- Events & Networks Catalog (FR-05..FR-08, strict server sanitization RM-01/RM-02) ---
app.get('/api/events', async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const { country, city, sector, format, dateRange, q } = req.query;
  const isAdmin = req.member?.role === 'admin';

  let list = db.events.filter((e) => (isAdmin ? true : e.status === 'published'));
  if (country && country !== 'all') {
    list = list.filter((e) => e.country.toLowerCase() === String(country).toLowerCase());
  }
  if (city && city !== 'all') {
    list = list.filter((e) => e.city.toLowerCase().includes(String(city).toLowerCase()));
  }
  if (sector && sector !== 'all') {
    list = list.filter((e) => e.sector.toLowerCase() === String(sector).toLowerCase());
  }
  if (format && format !== 'all') {
    list = list.filter((e) => e.format === format);
  }
  if (dateRange && dateRange !== 'all') {
    const nowMs = Date.now();
    if (dateRange === '30d') {
      list = list.filter((e) => {
        const ms = new Date(e.dateIso).getTime();
        return ms >= nowMs && ms <= nowMs + 30 * 86400000;
      });
    } else if (dateRange === '2026' || dateRange === '2027') {
      list = list.filter((e) => new Date(e.dateIso).getFullYear() === Number(dateRange));
    }
  }
  if (q) {
    const query = String(q).toLowerCase();
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(query) ||
        e.publicSummary.toLowerCase().includes(query) ||
        e.city.toLowerCase().includes(query) ||
        e.country.toLowerCase().includes(query) ||
        e.sector.toLowerCase().includes(query)
    );
  }

  const sanitized = list.map((ev) => {
    const isReg = req.member
      ? db.registrations.some((r) => r.eventId === ev.id && r.memberId === req.member!.id && r.status === 'confirmed')
      : false;
    return sanitizeEventForUser(ev, req.member, isReg);
  });

  res.json({ events: sanitized });
});

app.get('/api/events/:id', async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const ev = db.events.find((e) => e.id === req.params.id);
  if (!ev || (ev.status !== 'published' && req.member?.role !== 'admin')) {
    res.status(404).json({ error: 'Événement introuvable.' });
    return;
  }
  const isReg = req.member
    ? db.registrations.some((r) => r.eventId === ev.id && r.memberId === req.member!.id && r.status === 'confirmed')
    : false;
  res.json({ event: sanitizeEventForUser(ev, req.member, isReg) });
});

app.post('/api/events/:id/register', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const ev = db.events.find((e) => e.id === req.params.id);
  if (!ev) {
    res.status(404).json({ error: 'Événement introuvable.' });
    return;
  }
  const check = canRegisterForEvent(ev, req.member, db.registrations);
  if (!check.allowed) {
    const status = check.code === 'SUBSCRIPTION_REQUIRED' ? 403 : check.code === 'DUPLICATE_REGISTRATION' ? 409 : 400;
    res.status(status).json({ error: check.reason, code: check.code });
    return;
  }

  const { sessionSlot } = req.body ?? {};
  const reg: EventRegistration = {
    id: `reg-${crypto.randomUUID().slice(0, 8)}`,
    eventId: ev.id,
    memberId: req.member!.id,
    status: 'confirmed',
    confirmationCode: `AE-${ev.city.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
    sessionSlot: typeof sessionSlot === 'string' && sessionSlot ? sessionSlot : 'Plénière',
    createdAt: new Date().toISOString(),
  };
  db.registrations.push(reg);
  ev.registeredCount += 1;

  const notif: AppNotification = {
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    memberId: req.member!.id,
    kind: 'registration',
    title: 'Inscription confirmée',
    body: `${ev.title} (${reg.sessionSlot}) — Code ${reg.confirmationCode}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
  db.notifications.push(notif);
  saveDb(db);

  broadcastToAll('event:updated', { eventId: ev.id, registeredCount: ev.registeredCount });
  broadcastToUser(req.member!.id, 'notification:new', notif);

  res.status(201).json({
    registration: reg,
    event: sanitizeEventForUser(ev, req.member, true),
  });
});

app.delete('/api/events/:id/register', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const ev = db.events.find((e) => e.id === req.params.id);
  const reg = db.registrations.find(
    (r) => r.eventId === req.params.id && r.memberId === req.member!.id && r.status === 'confirmed'
  );
  if (!ev || !reg) {
    res.status(404).json({ error: 'Inscription introuvable.' });
    return;
  }
  reg.status = 'cancelled';
  ev.registeredCount = Math.max(0, ev.registeredCount - 1);
  saveDb(db);
  broadcastToAll('event:updated', { eventId: ev.id, registeredCount: ev.registeredCount });
  res.json({ ok: true, event: sanitizeEventForUser(ev, req.member, false) });
});

app.post('/api/events/:id/favorite', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const ev = db.events.find((e) => e.id === req.params.id);
  if (!ev || (ev.status !== 'published' && req.member?.role !== 'admin')) {
    res.status(404).json({ error: 'Événement introuvable.' });
    return;
  }
  const m = db.members.find((x) => x.id === req.member!.id);
  if (!m) {
    res.status(404).json({ error: 'Membre introuvable.' });
    return;
  }
  const current = Array.isArray(m.favoriteEventIds) ? m.favoriteEventIds : [];
  const exists = current.includes(ev.id);
  m.favoriteEventIds = exists ? current.filter((id) => id !== ev.id) : [...current, ev.id];
  saveDb(db);
  res.json({ favoriteEventIds: m.favoriteEventIds, isFavorite: !exists });
});

app.get('/api/networks', async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const isAdmin = req.member?.role === 'admin';
  const list = db.networks
    .filter((n) => (isAdmin ? true : n.status === 'published'))
    .map((n) => sanitizeNetworkForUser(n, req.member));
  res.json({ networks: list });
});

// --- Business Opportunities & Discussion Groups (§4.2 Evolutions) ---
app.get('/api/opportunities', async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const isAdmin = req.member?.role === 'admin';
  const list = db.opportunities
    .filter((o) => (isAdmin ? true : o.status === 'published'))
    .map((o) => sanitizeOpportunityForUser(o, req.member));
  res.json({ opportunities: list });
});

app.post('/api/opportunities', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({
      error: 'La publication d’opportunités d’affaires est réservée aux membres abonnés.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }
  const { title, category, publicSummary, fullDetails, country, sector, budgetRange } = req.body ?? {};
  if (!title || !publicSummary || !sector) {
    res.status(400).json({ error: 'Titre, résumé et secteur requis.' });
    return;
  }
  const db = await loadDb();
  const ent = db.enterprises.find((e) => e.ownerId === req.member!.id);
  const opp: BusinessOpportunity = {
    id: `opp-${crypto.randomUUID().slice(0, 8)}`,
    authorId: req.member!.id,
    authorName: req.member!.fullName,
    companyName: ent?.name || req.member!.city,
    title: String(title).trim(),
    category:
      category === 'co_investment' ||
      category === 'commercial_partner' ||
      category === 'supplier' ||
      category === 'call_for_projects'
        ? category
        : 'commercial_partner',
    publicSummary: String(publicSummary).trim(),
    fullDetails: String(fullDetails || publicSummary).trim(),
    country: String(country || req.member!.country),
    sector: String(sector).trim(),
    budgetRange: String(budgetRange || 'À convenir').trim(),
    status: 'published',
    createdAt: new Date().toISOString(),
  };
  db.opportunities.unshift(opp);
  saveDb(db);
  res.status(201).json({ opportunity: sanitizeOpportunityForUser(opp, req.member) });
});

app.get('/api/groups', async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const groups = db.groups.map((g) => sanitizeGroupForUser(g, req.member));
  res.json({ groups });
});

app.get('/api/groups/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({
      error: 'Les cercles de discussion sectoriels sont réservés aux membres abonnés.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }
  const db = await loadDb();
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Groupe introuvable.' });
    return;
  }
  const messages = db.groupMessages
    .filter((m) => m.groupId === group.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ group, messages });
});

app.post('/api/groups/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({
      error: 'Abonnement actif requis pour publier dans un cercle de discussion.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }
  const { text } = req.body ?? {};
  if (!text || !String(text).trim()) {
    res.status(400).json({ error: 'Message vide.' });
    return;
  }
  const db = await loadDb();
  const group = db.groups.find((g) => g.id === req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Groupe introuvable.' });
    return;
  }
  const profile = db.profiles.find((p) => p.memberId === req.member!.id);
  const gmsg: GroupMessage = {
    id: `gmsg-${crypto.randomUUID().slice(0, 8)}`,
    groupId: group.id,
    authorId: req.member!.id,
    authorName: req.member!.fullName,
    authorHeadline: profile?.headline || req.member!.city,
    text: String(text).trim().slice(0, 1200),
    createdAt: new Date().toISOString(),
  };
  db.groupMessages.push(gmsg);
  saveDb(db);
  broadcastToAll('group:message', gmsg);
  res.status(201).json({ message: gmsg });
});

// --- Subscriptions & Payments (FR-09..FR-13, RM-03, RM-04) ---
app.get('/api/subscriptions/plans', (_req, res) => {
  res.json({ plans: SUBSCRIPTION_PRICING });
});

app.post('/api/subscriptions/checkout', requireAuth, async (req: AuthedRequest, res) => {
  const { plan, paymentMethodLabel = 'Visa •••• 4242', idempotencyKey } = req.body ?? {};
  if (plan !== 'monthly' && plan !== 'annual') {
    res.status(400).json({ error: 'Formule invalide (monthly ou annual).' });
    return;
  }
  const safeIdemKey = String(idempotencyKey || crypto.randomUUID());
  const db = await loadDb();

  // FR-13: Idempotent payment processing
  const existingPay = db.payments.find(
    (p) => p.idempotencyKey === safeIdemKey && p.memberId === req.member!.id
  );
  if (existingPay) {
    const member = db.members.find((m) => m.id === req.member!.id)!;
    res.json({
      payment: existingPay,
      user: stripSecretMemberFields(member),
      idempotentReplay: true,
    });
    return;
  }

  const member = db.members.find((m) => m.id === req.member!.id)!;
  const pricing = SUBSCRIPTION_PRICING[plan as SubscriptionPlan];
  const { startIso, endIso } = computeSubscriptionDates(plan);
  const now = new Date().toISOString();

  // Never store full card numbers (§12.3, FR-21) — keep only sanitized label with last 4 digits
  const sanitizedLabel = String(paymentMethodLabel).replace(/\d{6,}/g, '••••');

  const payment: PaymentRecord = {
    id: `pay-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    plan,
    amountEur: pricing.priceEur,
    currency: 'EUR',
    status: 'succeeded',
    paymentMethodLabel: sanitizedLabel,
    idempotencyKey: safeIdemKey,
    receiptNumber: `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: now,
  };
  db.payments.push(payment);

  if (member.role === 'personnel') {
    member.role = 'subscriber';
  }
  member.subscriptionStatus = 'active';
  member.subscriptionPlan = plan;
  member.subscriptionStart = startIso;
  member.subscriptionEnd = endIso;
  member.autoRenew = true;
  if (member.visibility === 'private') {
    member.visibility = 'public_subscribers';
  }

  const subLog: SubscriptionEventLog = {
    id: `slog-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    eventType: 'activated',
    plan,
    details: `${pricing.label} activé (${payment.receiptNumber})`,
    createdAt: now,
  };
  db.subscriptionLogs.unshift(subLog);

  const notif: AppNotification = {
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    kind: 'subscription',
    title: 'Abonnement activé',
    body: `${pricing.label} actif jusqu’au ${new Date(endIso).toLocaleDateString('fr-FR')}.`,
    read: false,
    createdAt: now,
  };
  db.notifications.push(notif);
  saveDb(db);

  broadcastToUser(member.id, 'subscription:updated', { user: stripSecretMemberFields(member) });
  broadcastToUser(member.id, 'notification:new', notif);

  res.status(201).json({
    payment,
    user: stripSecretMemberFields(member),
  });
});

app.post('/api/subscriptions/switch-plan', requireAuth, async (req: AuthedRequest, res) => {
  const { plan } = req.body ?? {};
  if (plan !== 'monthly' && plan !== 'annual') {
    res.status(400).json({ error: 'Formule invalide.' });
    return;
  }
  const db = await loadDb();
  const member = db.members.find((m) => m.id === req.member!.id)!;
  if (!hasActiveSubscription(member)) {
    res.status(403).json({ error: 'Un abonnement actif est requis pour changer de formule.' });
    return;
  }
  const pricing = SUBSCRIPTION_PRICING[plan as SubscriptionPlan];
  const { startIso, endIso } = computeSubscriptionDates(plan);
  const now = new Date().toISOString();
  member.subscriptionPlan = plan;
  member.subscriptionStart = startIso;
  member.subscriptionEnd = endIso;

  db.subscriptionLogs.unshift({
    id: `slog-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    eventType: 'plan_changed',
    plan,
    details: `Changement vers ${pricing.label} (${pricing.priceEur} €)`,
    createdAt: now,
  });
  saveDb(db);
  broadcastToUser(member.id, 'subscription:updated', { user: stripSecretMemberFields(member) });
  res.json({ user: stripSecretMemberFields(member) });
});

app.post('/api/subscriptions/auto-renew', requireAuth, async (req: AuthedRequest, res) => {
  const { autoRenew } = req.body ?? {};
  const db = await loadDb();
  const member = db.members.find((m) => m.id === req.member!.id)!;
  member.autoRenew = Boolean(autoRenew);
  saveDb(db);
  res.json({ user: stripSecretMemberFields(member) });
});

app.post('/api/subscriptions/simulate-payment-failure', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const member = db.members.find((m) => m.id === req.member!.id)!;
  const now = new Date().toISOString();
  member.subscriptionStatus = 'past_due';
  if (member.role === 'subscriber') {
    member.role = 'personnel';
  }
  db.payments.unshift({
    id: `pay-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    plan: member.subscriptionPlan || 'monthly',
    amountEur: SUBSCRIPTION_PRICING[member.subscriptionPlan || 'monthly'].priceEur,
    currency: 'EUR',
    status: 'failed',
    paymentMethodLabel: 'Carte •••• 0002',
    idempotencyKey: `fail-${Date.now()}`,
    receiptNumber: `ERR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: now,
  });
  db.subscriptionLogs.unshift({
    id: `slog-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    eventType: 'payment_failed',
    plan: member.subscriptionPlan,
    details: 'Échec de prélèvement — droits restreints au niveau Personnel (FR-12).',
    createdAt: now,
  });
  saveDb(db);
  broadcastToUser(member.id, 'subscription:updated', { user: stripSecretMemberFields(member) });
  res.json({ user: stripSecretMemberFields(member) });
});

app.post('/api/subscriptions/simulate-expire', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const member = db.members.find((m) => m.id === req.member!.id)!;
  const now = new Date().toISOString();
  member.subscriptionStatus = 'expired';
  member.subscriptionEnd = now;
  if (member.role === 'subscriber') {
    member.role = 'personnel';
  }
  db.subscriptionLogs.unshift({
    id: `slog-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    eventType: 'expired',
    plan: member.subscriptionPlan,
    details: 'Abonnement arrivé à échéance — profil conservé en niveau Personnel (RM-04).',
    createdAt: now,
  });
  saveDb(db);
  broadcastToUser(member.id, 'subscription:updated', { user: stripSecretMemberFields(member) });
  res.json({ user: stripSecretMemberFields(member) });
});

// FR-13: Idempotent payment webhook endpoint
app.post('/api/webhooks/payment', async (req, res) => {
  const { webhookEventId, memberId, plan = 'monthly', status = 'succeeded', paymentMethodLabel = 'Visa •••• 4242' } =
    req.body ?? {};
  if (!webhookEventId || !memberId) {
    res.status(400).json({ error: 'webhookEventId et memberId requis.' });
    return;
  }
  const db = await loadDb();
  const existing = db.payments.find((p) => p.idempotencyKey === `wh-${webhookEventId}`);
  if (existing) {
    res.json({ ok: true, idempotentReplay: true, payment: existing });
    return;
  }
  const member = db.members.find((m) => m.id === memberId);
  if (!member) {
    res.status(404).json({ error: 'Membre introuvable.' });
    return;
  }
  const now = new Date().toISOString();
  const validPlan: SubscriptionPlan = plan === 'annual' ? 'annual' : 'monthly';
  const pricing = SUBSCRIPTION_PRICING[validPlan];

  const payment: PaymentRecord = {
    id: `pay-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    plan: validPlan,
    amountEur: pricing.priceEur,
    currency: 'EUR',
    status: status === 'failed' ? 'failed' : 'succeeded',
    paymentMethodLabel: String(paymentMethodLabel).replace(/\d{6,}/g, '••••'),
    idempotencyKey: `wh-${webhookEventId}`,
    receiptNumber: `WH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: now,
  };
  db.payments.unshift(payment);

  if (payment.status === 'succeeded') {
    const { startIso, endIso } = computeSubscriptionDates(validPlan);
    member.subscriptionStatus = 'active';
    member.subscriptionPlan = validPlan;
    member.subscriptionStart = startIso;
    member.subscriptionEnd = endIso;
    if (member.role === 'personnel') member.role = 'subscriber';
    db.subscriptionLogs.unshift({
      id: `slog-${crypto.randomUUID().slice(0, 8)}`,
      memberId: member.id,
      eventType: 'renewed',
      plan: validPlan,
      details: `Webhook renouvellement confirmé (${payment.receiptNumber})`,
      createdAt: now,
    });
  } else {
    member.subscriptionStatus = 'past_due';
    if (member.role === 'subscriber') member.role = 'personnel';
    db.subscriptionLogs.unshift({
      id: `slog-${crypto.randomUUID().slice(0, 8)}`,
      memberId: member.id,
      eventType: 'payment_failed',
      plan: validPlan,
      details: 'Webhook échec paiement',
      createdAt: now,
    });
  }
  saveDb(db);
  broadcastToUser(member.id, 'subscription:updated', { user: stripSecretMemberFields(member) });
  res.json({ ok: true, payment });
});

app.post('/api/subscriptions/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const member = db.members.find((m) => m.id === req.member!.id)!;
  const now = new Date().toISOString();
  // RM-04: Return to Personnel level, keep profile & data intact
  member.subscriptionStatus = 'cancelled';
  member.autoRenew = false;
  if (member.role === 'subscriber') {
    member.role = 'personnel';
  }
  db.subscriptionLogs.unshift({
    id: `slog-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    eventType: 'cancelled',
    plan: member.subscriptionPlan,
    details: 'Résiliation volontaire — compte ramené au niveau Personnel.',
    createdAt: now,
  });
  const notif: AppNotification = {
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    memberId: member.id,
    kind: 'subscription',
    title: 'Abonnement résilié',
    body: 'Votre compte revient au niveau Personnel. Votre profil et vos données restent conservés.',
    read: false,
    createdAt: now,
  };
  db.notifications.push(notif);
  saveDb(db);
  broadcastToUser(member.id, 'subscription:updated', { user: stripSecretMemberFields(member) });
  res.json({ user: stripSecretMemberFields(member) });
});

// --- Directory & Networking (FR-14, FR-15, strict server-side check) ---
app.get('/api/directory', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({
      error: 'L’annuaire des professionnels et entreprises est réservé aux membres abonnés.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }
  const db = await loadDb();
  const { country, sector, skill, collaboration, q } = req.query;

  let entries: DirectoryEntry[] = db.members
    .filter((m) => {
      if (m.id === req.member!.id) return false;
      if (m.suspended) return false;
      if (m.visibility === 'private') return false;
      if (isBlockedBetween(req.member!.id, m.id, db.blocks)) return false;
      return m.role === 'subscriber' || m.role === 'organizer' || m.role === 'admin';
    })
    .map((m) => ({
      member: {
        id: m.id,
        fullName: m.fullName,
        country: m.country,
        city: m.city,
        language: m.language,
        avatarUrl: m.avatarUrl,
        publicKeyJwk: m.publicKeyJwk,
        keyFingerprint: m.keyFingerprint,
        visibility: m.visibility,
        profileViews: m.profileViews || 0,
      },
      profile: db.profiles.find((p) => p.memberId === m.id),
      enterprise: db.enterprises.find((e) => e.ownerId === m.id),
    }));

  if (country && country !== 'all') {
    const cLower = String(country).toLowerCase();
    entries = entries.filter(
      (e) =>
        e.member.country.toLowerCase() === cLower ||
        e.profile?.activeCountries.some((ac) => ac.toLowerCase() === cLower)
    );
  }
  if (sector && sector !== 'all') {
    const sLower = String(sector).toLowerCase();
    entries = entries.filter(
      (e) =>
        e.profile?.sectors.some((s) => s.toLowerCase() === sLower) ||
        e.enterprise?.sector.toLowerCase() === sLower
    );
  }
  if (skill && skill !== 'all') {
    const skLower = String(skill).toLowerCase();
    entries = entries.filter((e) => e.profile?.skills.some((s) => s.toLowerCase().includes(skLower)));
  }
  if (collaboration && collaboration !== 'all') {
    const colLower = String(collaboration).toLowerCase();
    entries = entries.filter((e) =>
      e.profile?.collaborationNeeds.some((n) => n.toLowerCase().includes(colLower))
    );
  }
  if (q) {
    const ql = String(q).toLowerCase();
    entries = entries.filter(
      (e) =>
        e.member.fullName.toLowerCase().includes(ql) ||
        e.member.city.toLowerCase().includes(ql) ||
        e.member.country.toLowerCase().includes(ql) ||
        e.profile?.headline.toLowerCase().includes(ql) ||
        e.profile?.bio.toLowerCase().includes(ql) ||
        e.enterprise?.name.toLowerCase().includes(ql)
    );
  }

  res.json({ entries, onlineUsers: getOnlineUserIds() });
});

// §4.2 Profile / enterprise view counter
app.post('/api/directory/:memberId/view', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({ error: 'Abonnement requis.' });
    return;
  }
  const db = await loadDb();
  const target = db.members.find((m) => m.id === req.params.memberId);
  if (target && target.id !== req.member!.id) {
    target.profileViews = (target.profileViews || 0) + 1;
    const ent = db.enterprises.find((e) => e.ownerId === target.id);
    if (ent) ent.viewsCount = (ent.viewsCount || 0) + 1;
    saveDb(db);
  }
  res.json({ ok: true });
});

app.get('/api/connections', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({
      error: 'Les demandes de contact sont réservées aux membres abonnés.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }
  const db = await loadDb();
  const mine = db.connections.filter(
    (c) => c.senderId === req.member!.id || c.recipientId === req.member!.id
  );
  const peerIds = new Set<string>();
  for (const c of mine) {
    peerIds.add(c.senderId === req.member!.id ? c.recipientId : c.senderId);
  }
  const peers = db.members
    .filter((m) => peerIds.has(m.id))
    .map((m) => ({
      id: m.id,
      fullName: m.fullName,
      city: m.city,
      country: m.country,
      avatarUrl: m.avatarUrl,
      publicKeyJwk: m.publicKeyJwk,
      keyFingerprint: m.keyFingerprint,
      headline: db.profiles.find((p) => p.memberId === m.id)?.headline || '',
    }));
  res.json({ connections: mine, peers, blocks: db.blocks.filter((b) => b.blockerId === req.member!.id) });
});

app.post('/api/connections', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({ error: 'Abonnement requis pour envoyer une demande de contact.', code: 'SUBSCRIPTION_REQUIRED' });
    return;
  }
  const { recipientId, introMessage = '' } = req.body ?? {};
  if (!recipientId || recipientId === req.member!.id) {
    res.status(400).json({ error: 'Destinataire invalide.' });
    return;
  }
  const db = await loadDb();
  const recipient = db.members.find((m) => m.id === recipientId);
  if (!recipient) {
    res.status(404).json({ error: 'Membre introuvable.' });
    return;
  }
  if (isBlockedBetween(req.member!.id, recipientId, db.blocks)) {
    res.status(403).json({ error: 'Impossible de contacter ce membre.' });
    return;
  }

  const existing = db.connections.find(
    (c) =>
      (c.senderId === req.member!.id && c.recipientId === recipientId) ||
      (c.senderId === recipientId && c.recipientId === req.member!.id)
  );
  if (existing) {
    res.json({ connection: existing });
    return;
  }

  const now = new Date().toISOString();
  const conn: ContactConnection = {
    id: `conn-${crypto.randomUUID().slice(0, 8)}`,
    senderId: req.member!.id,
    recipientId,
    introMessage: String(introMessage).slice(0, 400),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  db.connections.push(conn);

  const notif: AppNotification = {
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    memberId: recipientId,
    kind: 'connection',
    title: 'Nouvelle demande de contact',
    body: `${req.member!.fullName} souhaite se connecter avec vous.`,
    read: false,
    createdAt: now,
  };
  db.notifications.push(notif);
  saveDb(db);

  broadcastToUser(recipientId, 'connection:updated', conn);
  broadcastToUser(recipientId, 'notification:new', notif);

  res.status(201).json({ connection: conn });
});

app.patch('/api/connections/:id', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({ error: 'Abonnement requis.', code: 'SUBSCRIPTION_REQUIRED' });
    return;
  }
  const { status } = req.body ?? {};
  if (status !== 'accepted' && status !== 'declined') {
    res.status(400).json({ error: 'Statut invalide.' });
    return;
  }
  const db = await loadDb();
  const conn = db.connections.find((c) => c.id === req.params.id);
  if (!conn || conn.recipientId !== req.member!.id) {
    res.status(404).json({ error: 'Demande de contact introuvable.' });
    return;
  }
  conn.status = status;
  conn.updatedAt = new Date().toISOString();

  if (status === 'accepted') {
    const notif: AppNotification = {
      id: `notif-${crypto.randomUUID().slice(0, 8)}`,
      memberId: conn.senderId,
      kind: 'connection',
      title: 'Demande acceptée',
      body: `${req.member!.fullName} a accepté votre demande. La messagerie E2EE est ouverte.`,
      read: false,
      createdAt: conn.updatedAt,
    };
    db.notifications.push(notif);
    broadcastToUser(conn.senderId, 'notification:new', notif);
  }
  saveDb(db);
  broadcastToUser(conn.senderId, 'connection:updated', conn);
  broadcastToUser(conn.recipientId, 'connection:updated', conn);

  res.json({ connection: conn });
});

// --- End-to-End Encrypted Multimodal Messaging (FR-16, RM-08) ---
app.get('/api/messages/:peerId', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const peerId = String(req.params.peerId);
  const check = canMessageRecipient(req.member, peerId, db.connections, db.blocks);
  if (!check.allowed) {
    res.status(403).json({ error: check.reason, code: check.code });
    return;
  }
  const convId = [req.member!.id, peerId].sort().join('__');
  const msgs = db.messages
    .filter((m) => m.conversationId === convId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ messages: msgs });
});

app.post('/api/messages', requireAuth, async (req: AuthedRequest, res) => {
  const { recipientId, senderPubKey, envelope, mediaType = 'text', clientMutationId } = req.body ?? {};
  if (!recipientId || !senderPubKey || !envelope?.ciphertext || !envelope?.iv) {
    res.status(400).json({ error: 'Enveloppe E2EE et destinataire requis.' });
    return;
  }
  const db = await loadDb();
  const check = canMessageRecipient(req.member, String(recipientId), db.connections, db.blocks);
  if (!check.allowed) {
    res.status(403).json({ error: check.reason, code: check.code });
    return;
  }

  const mutId = String(clientMutationId || crypto.randomUUID());
  const duplicate = db.messages.find((m) => m.clientMutationId === mutId);
  if (duplicate) {
    res.json({ message: duplicate, idempotentReplay: true });
    return;
  }

  const convId = [req.member!.id, String(recipientId)].sort().join('__');
  const now = new Date().toISOString();
  const record: EncryptedMessageRecord = {
    id: `msg-${crypto.randomUUID().slice(0, 8)}`,
    conversationId: convId,
    senderId: req.member!.id,
    recipientId: String(recipientId),
    senderPubKey,
    envelope,
    mediaType,
    clientMutationId: mutId,
    createdAt: now,
  };
  db.messages.push(record);

  const notif: AppNotification = {
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    memberId: String(recipientId),
    kind: 'message',
    title: 'Nouveau message chiffré',
    body: `${req.member!.fullName} vous a envoyé un message (${mediaType}).`,
    read: false,
    createdAt: now,
  };
  db.notifications.push(notif);
  saveDb(db);

  broadcastToUser(String(recipientId), 'message:new', record);
  broadcastToUser(req.member!.id, 'message:new', record);
  broadcastToUser(String(recipientId), 'notification:new', notif);

  res.status(201).json({ message: record });
});

app.post('/api/messages/:peerId/read', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const peerId = String(req.params.peerId);
  const convId = [req.member!.id, peerId].sort().join('__');
  const now = new Date().toISOString();
  let updated = 0;
  for (const m of db.messages) {
    if (m.conversationId === convId && m.recipientId === req.member!.id && !m.readAt) {
      m.readAt = now;
      updated += 1;
    }
  }
  if (updated > 0) {
    saveDb(db);
    broadcastToUser(peerId, 'message:read', { peerId: req.member!.id, readAt: now });
  }
  res.json({ ok: true, updated });
});

// --- Reports & Blocks (FR-16, RM-08) ---
app.post('/api/blocks', requireAuth, async (req: AuthedRequest, res) => {
  const { blockedId } = req.body ?? {};
  if (!blockedId || blockedId === req.member!.id) {
    res.status(400).json({ error: 'Membre invalide.' });
    return;
  }
  const db = await loadDb();
  if (!db.blocks.some((b) => b.blockerId === req.member!.id && b.blockedId === blockedId)) {
    db.blocks.push({
      id: `blk-${crypto.randomUUID().slice(0, 8)}`,
      blockerId: req.member!.id,
      blockedId: String(blockedId),
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
  }
  res.json({ ok: true });
});

app.delete('/api/blocks/:blockedId', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const before = db.blocks.length;
  db.blocks = db.blocks.filter(
    (b) => !(b.blockerId === req.member!.id && b.blockedId === req.params.blockedId)
  );
  if (db.blocks.length !== before) {
    saveDb(db);
  }
  res.json({ ok: true });
});

app.post('/api/reports', requireAuth, async (req: AuthedRequest, res) => {
  const { targetType, targetId, reason } = req.body ?? {};
  if (!targetType || !targetId || !reason) {
    res.status(400).json({ error: 'Objet et motif du signalement requis.' });
    return;
  }
  const db = await loadDb();
  const report: ModerationReport = {
    id: `rep-${crypto.randomUUID().slice(0, 8)}`,
    reporterId: req.member!.id,
    targetType,
    targetId: String(targetId),
    reason: String(reason),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  db.reports.push(report);
  saveDb(db);
  res.status(201).json({ report });
});

app.post('/api/notifications/read-all', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  for (const n of db.notifications) {
    if (n.memberId === req.member!.id) n.read = true;
  }
  saveDb(db);
  res.json({ ok: true });
});

// --- Organizer Workspace (§3, FR-08) ---
app.get('/api/organizer/events', requireAuth, requireOrganizerOrAdmin, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const mine =
    req.member!.role === 'admin'
      ? db.events
      : db.events.filter((e) => e.organizerId === req.member!.id);
  res.json({ events: mine });
});

app.post('/api/organizer/events', requireAuth, requireOrganizerOrAdmin, async (req: AuthedRequest, res) => {
  const {
    title,
    publicSummary,
    fullDescription,
    dateIso,
    country,
    city,
    sector,
    format,
    venueAddress,
    virtualLink,
    capacity,
    feeEur,
  } = req.body ?? {};
  if (!title || !city || !country || !sector) {
    res.status(400).json({ error: 'Titre, pays, ville et secteur sont obligatoires.' });
    return;
  }
  const db = await loadDb();
  const ev: BusinessEvent = {
    id: `evt-${crypto.randomUUID().slice(0, 8)}`,
    organizerId: req.member!.id,
    organizerName: req.member!.fullName,
    title: String(title),
    publicSummary: String(publicSummary || ''),
    fullDescription: String(fullDescription || publicSummary || ''),
    dateIso: String(dateIso || new Date(Date.now() + 86400000 * 14).toISOString()),
    country: String(country),
    city: String(city),
    sector: String(sector),
    format: format === 'virtual' || format === 'hybrid' ? format : 'in_person',
    venueAddress: String(venueAddress || `${city}, ${country}`),
    virtualLink: String(virtualLink || ''),
    capacity: Math.max(1, Number(capacity) || 100),
    registeredCount: 0,
    feeEur: Math.max(0, Number(feeEur) || 0),
    imageUrl: '/src/assets/images/event_dakar_summit_1795137733263.jpg',
    status: 'published',
  };
  db.events.unshift(ev);
  saveDb(db);
  broadcastToAll('event:updated', { eventId: ev.id });
  res.status(201).json({ event: ev });
});

app.patch('/api/organizer/events/:id', requireAuth, requireOrganizerOrAdmin, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const ev = db.events.find((e) => e.id === req.params.id);
  if (!ev) {
    res.status(404).json({ error: 'Événement introuvable.' });
    return;
  }
  if (!canManageEvent(ev, req.member)) {
    res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres événements.' });
    return;
  }
  const {
    title,
    publicSummary,
    fullDescription,
    dateIso,
    country,
    city,
    sector,
    format,
    venueAddress,
    virtualLink,
    capacity,
    feeEur,
    status,
  } = req.body ?? {};
  if (title) ev.title = String(title);
  if (typeof publicSummary === 'string') ev.publicSummary = publicSummary;
  if (typeof fullDescription === 'string') ev.fullDescription = fullDescription;
  if (dateIso) ev.dateIso = String(dateIso);
  if (country) ev.country = String(country);
  if (city) ev.city = String(city);
  if (sector) ev.sector = String(sector);
  if (format === 'in_person' || format === 'virtual' || format === 'hybrid') ev.format = format;
  if (typeof venueAddress === 'string') ev.venueAddress = venueAddress;
  if (typeof virtualLink === 'string') ev.virtualLink = virtualLink;
  if (typeof capacity === 'number' && capacity > 0) ev.capacity = capacity;
  if (typeof feeEur === 'number' && feeEur >= 0) ev.feeEur = feeEur;
  if (status === 'published' || status === 'draft' || status === 'archived') ev.status = status;

  saveDb(db);
  broadcastToAll('event:updated', { eventId: ev.id });
  res.json({ event: ev });
});

app.get('/api/organizer/events/:id/participants', requireAuth, requireOrganizerOrAdmin, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const ev = db.events.find((e) => e.id === req.params.id);
  if (!ev) {
    res.status(404).json({ error: 'Événement introuvable.' });
    return;
  }
  if (!canManageEvent(ev, req.member)) {
    res.status(403).json({ error: 'Accès limité aux organisateurs de cet événement.' });
    return;
  }
  const regs = db.registrations.filter((r) => r.eventId === ev.id);
  const participants: EventParticipantSummary[] = regs.map((r) => {
    const m = db.members.find((x) => x.id === r.memberId);
    return {
      registrationId: r.id,
      memberId: r.memberId,
      fullName: m?.fullName || 'Membre',
      email: m?.email || '',
      city: m?.city || '',
      country: m?.country || '',
      confirmationCode: r.confirmationCode,
      sessionSlot: r.sessionSlot,
      status: r.status,
      createdAt: r.createdAt,
    };
  });
  res.json({ event: ev, participants });
});

// --- Administration & Moderation (FR-18..FR-22) ---
app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res) => {
  const db = await loadDb();
  res.json({
    members: db.members.map(stripSecretMemberFields),
    enterprises: db.enterprises,
    events: db.events,
    networks: db.networks,
    payments: db.payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    subscriptionLogs: db.subscriptionLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    reports: db.reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    auditLogs: db.auditLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

app.post('/api/admin/events', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { title, publicSummary, fullDescription, dateIso, country, city, sector, format, venueAddress, virtualLink, capacity, feeEur } =
    req.body ?? {};
  if (!title || !city || !country || !sector) {
    res.status(400).json({ error: 'Titre, pays, ville et secteur sont obligatoires.' });
    return;
  }
  const db = await loadDb();
  const ev: BusinessEvent = {
    id: `evt-${crypto.randomUUID().slice(0, 8)}`,
    organizerId: req.member!.id,
    organizerName: req.member!.fullName,
    title: String(title),
    publicSummary: String(publicSummary || ''),
    fullDescription: String(fullDescription || publicSummary || ''),
    dateIso: String(dateIso || new Date(Date.now() + 86400000 * 14).toISOString()),
    country: String(country),
    city: String(city),
    sector: String(sector),
    format: format === 'virtual' || format === 'hybrid' ? format : 'in_person',
    venueAddress: String(venueAddress || `${city}, ${country}`),
    virtualLink: String(virtualLink || ''),
    capacity: Math.max(1, Number(capacity) || 100),
    registeredCount: 0,
    feeEur: Math.max(0, Number(feeEur) || 0),
    imageUrl: '/src/assets/images/event_dakar_summit_1795137733263.jpg',
    status: 'published',
  };
  db.events.unshift(ev);
  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: req.member!.id,
    actorEmail: req.member!.email,
    action: 'CREATE_EVENT',
    target: ev.id,
    details: `Création et publication de "${ev.title}"`,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  broadcastToAll('event:updated', { eventId: ev.id });
  res.status(201).json({ event: ev });
});

app.patch('/api/admin/events/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const ev = db.events.find((e) => e.id === req.params.id);
  if (!ev) {
    res.status(404).json({ error: 'Événement introuvable.' });
    return;
  }
  const {
    status,
    title,
    publicSummary,
    fullDescription,
    dateIso,
    country,
    city,
    sector,
    format,
    venueAddress,
    virtualLink,
    capacity,
    feeEur,
  } = req.body ?? {};
  if (status === 'published' || status === 'suspended' || status === 'archived' || status === 'draft') {
    ev.status = status;
  }
  if (title) ev.title = String(title);
  if (typeof publicSummary === 'string') ev.publicSummary = publicSummary;
  if (typeof fullDescription === 'string') ev.fullDescription = fullDescription;
  if (dateIso) ev.dateIso = String(dateIso);
  if (country) ev.country = String(country);
  if (city) ev.city = String(city);
  if (sector) ev.sector = String(sector);
  if (format === 'in_person' || format === 'virtual' || format === 'hybrid') ev.format = format;
  if (typeof venueAddress === 'string') ev.venueAddress = venueAddress;
  if (typeof virtualLink === 'string') ev.virtualLink = virtualLink;
  if (typeof capacity === 'number' && capacity > 0) ev.capacity = capacity;
  if (typeof feeEur === 'number' && feeEur >= 0) ev.feeEur = feeEur;

  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: req.member!.id,
    actorEmail: req.member!.email,
    action: 'UPDATE_EVENT',
    target: ev.id,
    details: `Statut: ${ev.status}, Titre: ${ev.title}`,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  broadcastToAll('event:updated', { eventId: ev.id });
  res.json({ event: ev });
});

app.post('/api/admin/networks', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { name, publicSummary, fullDescription, countries, sectors, contactEmail } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: 'Nom du réseau requis.' });
    return;
  }
  const db = await loadDb();
  const net: ProfessionalNetwork = {
    id: `net-${crypto.randomUUID().slice(0, 8)}`,
    name: String(name),
    publicSummary: String(publicSummary || ''),
    fullDescription: String(fullDescription || publicSummary || ''),
    countries: Array.isArray(countries) ? countries : ['Sénégal', 'France'],
    sectors: Array.isArray(sectors) ? sectors : ['Entrepreneuriat'],
    contactEmail: String(contactEmail || 'reseau@africaentrepreneur.com'),
    memberCount: 1,
    status: 'published',
  };
  db.networks.unshift(net);
  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: req.member!.id,
    actorEmail: req.member!.email,
    action: 'CREATE_NETWORK',
    target: net.id,
    details: `Publication du réseau "${net.name}"`,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.status(201).json({ network: net });
});

app.patch('/api/admin/networks/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const net = db.networks.find((n) => n.id === req.params.id);
  if (!net) {
    res.status(404).json({ error: 'Réseau introuvable.' });
    return;
  }
  const { name, publicSummary, fullDescription, countries, sectors, contactEmail, status } = req.body ?? {};
  if (name) net.name = String(name);
  if (typeof publicSummary === 'string') net.publicSummary = publicSummary;
  if (typeof fullDescription === 'string') net.fullDescription = fullDescription;
  if (Array.isArray(countries)) net.countries = countries;
  if (Array.isArray(sectors)) net.sectors = sectors;
  if (typeof contactEmail === 'string') net.contactEmail = contactEmail;
  if (status === 'published' || status === 'suspended' || status === 'archived' || status === 'draft') {
    net.status = status;
  }
  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: req.member!.id,
    actorEmail: req.member!.email,
    action: 'UPDATE_NETWORK',
    target: net.id,
    details: `Réseau "${net.name}" -> ${net.status}`,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.json({ network: net });
});

app.patch('/api/admin/reports/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { status, resolutionNote, suspendTargetMember } = req.body ?? {};
  const db = await loadDb();
  const report = db.reports.find((r) => r.id === req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Signalement introuvable.' });
    return;
  }
  if (status === 'resolved' || status === 'dismissed' || status === 'open') {
    report.status = status;
  }
  if (resolutionNote) report.resolutionNote = String(resolutionNote);

  if (suspendTargetMember && report.targetType === 'member') {
    const targetMember = db.members.find((m) => m.id === report.targetId);
    if (targetMember && targetMember.role !== 'admin') {
      targetMember.suspended = true;
    }
  }

  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: req.member!.id,
    actorEmail: req.member!.email,
    action: 'MODERATE_REPORT',
    target: report.id,
    details: `Décision: ${report.status}${suspendTargetMember ? ' (membre suspendu)' : ''}`,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.json({ report });
});

app.patch('/api/admin/members/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { suspended, role } = req.body ?? {};
  const db = await loadDb();
  const m = db.members.find((x) => x.id === req.params.id);
  if (!m) {
    res.status(404).json({ error: 'Membre introuvable.' });
    return;
  }
  const changes: string[] = [];
  if (typeof suspended === 'boolean' && m.role !== 'admin') {
    m.suspended = suspended;
    changes.push(suspended ? 'suspendu' : 'réactivé');
  }
  if ((role === 'personnel' || role === 'subscriber' || role === 'organizer') && m.role !== 'admin') {
    m.role = role;
    changes.push(`rôle -> ${role}`);
  }
  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: req.member!.id,
    actorEmail: req.member!.email,
    action: typeof suspended === 'boolean' ? (m.suspended ? 'SUSPEND_MEMBER' : 'RESTORE_MEMBER') : 'UPDATE_MEMBER_ROLE',
    target: m.id,
    details: `Membre ${m.email} (${changes.join(', ') || 'mise à jour'})`,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.json({ member: stripSecretMemberFields(m) });
});

app.patch('/api/admin/enterprises/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { verified } = req.body ?? {};
  const db = await loadDb();
  const ent = db.enterprises.find((e) => e.id === req.params.id);
  if (!ent) {
    res.status(404).json({ error: 'Entreprise introuvable.' });
    return;
  }
  if (typeof verified === 'boolean') ent.verified = verified;
  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: req.member!.id,
    actorEmail: req.member!.email,
    action: 'VERIFY_ENTERPRISE',
    target: ent.id,
    details: `Entreprise "${ent.name}" -> ${ent.verified ? 'vérifiée' : 'non vérifiée'}`,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.json({ enterprise: ent });
});

// --- Networking Trends (Python + JS hybrid 30d analytics) & Recommendations ---
app.get('/api/analytics/networking-trends', async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const lang: 'en' | 'fr' = req.query.lang === 'en' ? 'en' : 'fr';
  const payload = {
    connections: db.connections,
    messages: db.messages,
    groupMessages: db.groupMessages,
    registrations: db.registrations,
    scannedBadges: db.scannedBadges || [],
    userId: req.member?.id,
    lang,
    days: 30,
  };
  try {
    const pyResult = await runPythonEngine('networking_trends', payload);
    res.json(pyResult);
  } catch {
    const jsFallback = buildNetworkingTrends30Days(payload);
    res.json({ ...jsFallback, engine: 'js' });
  }
});

app.get('/api/analytics/recommendations', async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const lang: 'en' | 'fr' = req.query.lang === 'en' ? 'en' : 'fr';
  const member = req.member || null;
  const profile = member ? db.profiles.find((p) => p.memberId === member.id) || null : null;
  const regIds = member
    ? db.registrations
        .filter((r) => r.memberId === member.id && r.status === 'confirmed')
        .map((r) => r.eventId)
    : [];
  const sanitizedEvents = db.events
    .filter((e) => e.status === 'published')
    .map((e) => sanitizeEventForUser(e, member, regIds.includes(e.id)));

  try {
    const pyResult = await runPythonEngine('recommend_events', {
      events: sanitizedEvents,
      user: member ? stripSecretMemberFields(member) : null,
      profile,
      favoriteEventIds: member?.favoriteEventIds || [],
      registeredEventIds: regIds,
      lang,
    });
    res.json(pyResult);
  } catch {
    res.json({
      recommendations: sanitizedEvents.slice(0, 3).map((e) => ({
        eventId: e.id,
        title: e.title,
        sector: e.sector,
        city: e.city,
        country: e.country,
        dateIso: e.dateIso,
        format: e.format,
        remainingSeats: Math.max(0, e.capacity - e.registeredCount),
        capacity: e.capacity,
        registeredCount: e.registeredCount,
        score: 75,
        reason: lang === 'en' ? `Featured in ${e.city}` : `Rencontre clé à ${e.city}`,
        locked: Boolean(e.locked),
        imageUrl: e.imageUrl,
      })),
      engine: 'js',
    });
  }
});

app.get('/api/analytics/peer-matches', requireAuth, async (req: AuthedRequest, res) => {
  if (!hasActiveSubscription(req.member)) {
    res.status(403).json({
      error: 'Les suggestions de mise en relation sont réservées aux membres abonnés.',
      code: 'SUBSCRIPTION_REQUIRED',
    });
    return;
  }
  const db = await loadDb();
  const lang: 'en' | 'fr' = req.query.lang === 'en' ? 'en' : 'fr';
  const me = req.member!;
  const myProfile = db.profiles.find((p) => p.memberId === me.id) || null;
  const connectedIds = db.connections
    .filter((c) => c.status === 'accepted' && (c.senderId === me.id || c.recipientId === me.id))
    .map((c) => (c.senderId === me.id ? c.recipientId : c.senderId));
  const pendingIds = db.connections
    .filter((c) => c.status === 'pending' && (c.senderId === me.id || c.recipientId === me.id))
    .map((c) => (c.senderId === me.id ? c.recipientId : c.senderId));

  const candidates: DirectoryEntry[] = db.members
    .filter((m) => {
      if (m.id === me.id) return false;
      if (m.suspended) return false;
      if (m.visibility === 'private') return false;
      if (isBlockedBetween(me.id, m.id, db.blocks)) return false;
      return m.role === 'subscriber' || m.role === 'organizer' || m.role === 'admin';
    })
    .map((m) => ({
      member: {
        id: m.id,
        fullName: m.fullName,
        country: m.country,
        city: m.city,
        language: m.language,
        avatarUrl: m.avatarUrl,
        publicKeyJwk: m.publicKeyJwk,
        keyFingerprint: m.keyFingerprint,
        visibility: m.visibility,
        profileViews: m.profileViews || 0,
      },
      profile: db.profiles.find((p) => p.memberId === m.id),
      enterprise: db.enterprises.find((e) => e.ownerId === m.id),
    }));

  try {
    const pyResult = await runPythonEngine('match_peers', {
      user: stripSecretMemberFields(me),
      profile: myProfile,
      candidates,
      connectedIds,
      pendingIds,
      lang,
    });
    res.json(pyResult);
  } catch {
    res.json({
      matches: candidates.slice(0, 4).map((c) => ({
        memberId: c.member.id,
        fullName: c.member.fullName,
        city: c.member.city,
        country: c.member.country,
        avatarUrl: c.member.avatarUrl,
        headline: c.profile?.headline || '',
        enterpriseName: c.enterprise?.name || '',
        sector: c.enterprise?.sector || c.profile?.sectors[0] || 'Entrepreneuriat',
        score: 75,
        reason: lang === 'en' ? `Verified founder · ${c.member.city}` : `Dirigeant vérifié · ${c.member.city}`,
        connectionStatus: connectedIds.includes(c.member.id)
          ? 'accepted'
          : pendingIds.includes(c.member.id)
            ? 'pending'
            : 'none',
      })),
      engine: 'js',
    });
  }
});

app.get('/api/analytics/workspace-insights', requireAuth, requireOrganizerOrAdmin, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const me = req.member!;
  const scopedEvents =
    me.role === 'admin'
      ? db.events
      : db.events.filter((e) => e.organizerId === me.id || !e.organizerId);

  const payload = {
    events: scopedEvents,
    payments: me.role === 'admin' ? db.payments : [],
    reports: me.role === 'admin' ? db.reports : [],
  };

  try {
    const pyResult = await runPythonEngine('workspace_insights', payload);
    res.json(pyResult);
  } catch {
    const totalCapacity = scopedEvents.reduce((acc, e) => acc + Math.max(0, e.capacity || 0), 0);
    const totalRegistered = scopedEvents.reduce((acc, e) => acc + Math.max(0, e.registeredCount || 0), 0);
    const publishedEvents = scopedEvents.filter((e) => e.status === 'published').length;
    const estimatedTicketRevenueEur = scopedEvents.reduce(
      (acc, e) => acc + Math.max(0, e.feeEur || 0) * Math.max(0, e.registeredCount || 0),
      0
    );
    const paidSubscriptionRevenueEur =
      me.role === 'admin'
        ? db.payments
            .filter((p) => p.status === 'succeeded')
            .reduce((acc, p) => acc + Math.max(0, p.amountEur || 0), 0)
        : 0;
    const openReports = me.role === 'admin' ? db.reports.filter((r) => r.status === 'open').length : 0;
    res.json({
      totalEvents: scopedEvents.length,
      publishedEvents,
      totalCapacity,
      totalRegistered,
      fillRatePct: totalCapacity > 0 ? Math.min(100, Math.round((totalRegistered / totalCapacity) * 100)) : 0,
      estimatedTicketRevenueEur,
      paidSubscriptionRevenueEur,
      openReports,
      engine: 'js',
    });
  }
});

app.post('/api/badges/parse-python', requireAuth, async (req: AuthedRequest, res) => {
  const rawText = String(req.body?.rawText || '').trim();
  if (!rawText) {
    res.status(400).json({ error: 'Texte OCR requis.' });
    return;
  }
  try {
    const parsed = await runPythonEngine('parse_badge_ocr', { rawText });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Analyse Python indisponible.',
    });
  }
});

app.get('/api/badges', requireAuth, async (req: AuthedRequest, res) => {
  const db = await loadDb();
  const mine = (db.scannedBadges || [])
    .filter((b) => b.ownerId === req.member!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ badges: mine });
});

app.post('/api/badges', requireAuth, async (req: AuthedRequest, res) => {
  const {
    eventId,
    eventTitle,
    fullName,
    headline = '',
    companyName = '',
    sector = 'Entrepreneuriat',
    email = '',
    phone = '',
    city = '',
    country = '',
    linkedinUrl = '',
    rawText = '',
  } = req.body ?? {};

  if (!fullName || !String(fullName).trim()) {
    res.status(400).json({ error: 'Le nom du contact extrait du badge est requis.' });
    return;
  }

  const db = await loadDb();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = String(fullName).trim();
  const matchedMember = db.members.find(
    (m) =>
      m.id !== req.member!.id &&
      !m.suspended &&
      ((cleanEmail && m.email.toLowerCase() === cleanEmail) ||
        m.fullName.toLowerCase() === cleanName.toLowerCase())
  );

  const badge: ScannedBadgeContact = {
    id: `badge-${crypto.randomUUID().slice(0, 8)}`,
    ownerId: req.member!.id,
    eventId: eventId ? String(eventId) : undefined,
    eventTitle: eventTitle ? String(eventTitle) : undefined,
    fullName: cleanName,
    headline: String(headline).trim(),
    companyName: String(companyName).trim(),
    sector: String(sector).trim() || 'Entrepreneuriat',
    email: cleanEmail,
    phone: String(phone).trim(),
    city: String(city).trim(),
    country: String(country).trim(),
    linkedinUrl: String(linkedinUrl).trim() || undefined,
    rawText: String(rawText).trim() || undefined,
    matchedMemberId: matchedMember?.id,
    createdAt: new Date().toISOString(),
  };

  if (!Array.isArray(db.scannedBadges)) db.scannedBadges = [];
  db.scannedBadges = [
    badge,
    ...db.scannedBadges.filter(
      (b) => !(b.ownerId === req.member!.id && cleanEmail && b.email.toLowerCase() === cleanEmail)
    ),
  ];
  saveDb(db);
  res.status(201).json({ badge });
});

// --- Multimodal Gemini API Endpoints (Voice, OCR & Image Intelligence) ---
app.post('/api/multimodal/transcribe', requireAuth, async (req: AuthedRequest, res) => {
  const { audioBase64, mimeType = 'audio/webm' } = req.body ?? {};
  if (!audioBase64) {
    res.status(400).json({ error: 'Audio base64 requis.' });
    return;
  }
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Clé Gemini non configurée dans les secrets serveur pour la transcription cloud.',
    });
    return;
  }
  try {
    const cleanB64 = String(audioBase64).replace(/^data:[^;]+;base64,/, '');
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanB64 } },
          { text: 'Transcris fidèlement cet enregistrement vocal en français (ou dans sa langue parlée).' },
        ],
      },
    });
    res.json({ transcript: (response.text || '').trim() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur transcription audio.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/multimodal/scan-badge', async (req: AuthedRequest, res) => {
  const { imageBase64, mimeType = 'image/jpeg' } = req.body ?? {};
  if (!imageBase64) {
    res.status(400).json({ error: 'Image du badge (base64) requise.' });
    return;
  }
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Clé Gemini non configurée dans les secrets serveur pour l’OCR cloud.',
    });
    return;
  }
  try {
    const cleanB64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanB64 } },
          {
            text: 'Effectue une extraction OCR précise de ce badge professionnel ou carte d’événement. Extrais exactement les informations visibles sans inventer de champs absents.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fullName: { type: Type.STRING, description: 'Nom complet du participant.' },
            headline: { type: Type.STRING, description: 'Poste, fonction ou titre professionnel.' },
            companyName: { type: Type.STRING, description: 'Nom de l’entreprise ou organisation.' },
            sector: { type: Type.STRING, description: 'Secteur d’activité déduit ou affiché.' },
            email: { type: Type.STRING, description: 'Adresse courriel professionnelle.' },
            phone: { type: Type.STRING, description: 'Numéro de téléphone.' },
            city: { type: Type.STRING, description: 'Ville.' },
            country: { type: Type.STRING, description: 'Pays.' },
            linkedinUrl: { type: Type.STRING, description: 'Lien ou identifiant LinkedIn.' },
            rawText: { type: Type.STRING, description: 'Texte OCR brut lu sur le badge.' },
          },
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, string>;
    res.json({ extracted: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur OCR sur le badge.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/multimodal/analyze-image', requireAuth, async (req: AuthedRequest, res) => {
  const { imageBase64, mimeType = 'image/jpeg', context = 'profile' } = req.body ?? {};
  if (!imageBase64) {
    res.status(400).json({ error: 'Image base64 requise.' });
    return;
  }
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Clé Gemini non configurée dans les secrets serveur pour l’analyse visuelle.',
    });
    return;
  }
  try {
    const cleanB64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
    const promptText =
      context === 'profile'
        ? 'Analyse cette image (carte de visite, logo ou visuel professionnel) et retourne uniquement un JSON avec les champs: companyName, sector, headline, summary (en français).'
        : 'Décris brièvement ce document ou visuel professionnel en français en 2 phrases utiles pour un entrepreneur.';
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [{ inlineData: { mimeType, data: cleanB64 } }, { text: promptText }],
      },
    });
    res.json({ analysis: (response.text || '').trim() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur analyse image.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/multimodal/tts', requireAuth, async (req: AuthedRequest, res) => {
  const { text } = req.body ?? {};
  if (!text) {
    res.status(400).json({ error: 'Texte requis pour la synthèse vocale.' });
    return;
  }
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Synthèse vocale cloud indisponible sans clé Gemini ; utilisez la lecture vocale appareil.',
    });
    return;
  }
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: String(text).slice(0, 600),
              speechMetadata: { style: 'Voix professionnelle claire, chaleureuse et posée' },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(502).json({ error: 'Aucun flux audio généré.' });
      return;
    }
    res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur synthèse vocale.';
    res.status(502).json({ error: message });
  }
});

// --- Server & Vite Middleware Boot ---
async function startServer() {
  await loadDb();
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    let boundUserId: string | null = null;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const db = await loadDb();
          const session = db.sessions.find((s) => s.token === msg.token);
          if (session && new Date(session.expiresAt).getTime() > Date.now()) {
            boundUserId = session.userId;
            if (!wsClientsByUser.has(boundUserId)) {
              wsClientsByUser.set(boundUserId, new Set());
            }
            wsClientsByUser.get(boundUserId)!.add(ws);
            ws.send(JSON.stringify({ type: 'auth:ok', userId: boundUserId, onlineUsers: getOnlineUserIds() }));
            broadcastToAll('presence:update', { onlineUsers: getOnlineUserIds() });
          }
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      if (boundUserId) {
        const set = wsClientsByUser.get(boundUserId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) wsClientsByUser.delete(boundUserId);
        }
        broadcastToAll('presence:update', { onlineUsers: getOnlineUserIds() });
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
          } else if (
            filePath.endsWith('sw.js') ||
            filePath.endsWith('sw-notifications.js') ||
            filePath.endsWith('index.html')
          ) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint introuvable.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Africa Entrepreneur server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
