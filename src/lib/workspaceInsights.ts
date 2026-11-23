import type {
  BusinessEvent,
  EnterprisePage,
  EventParticipantSummary,
  MemberAccount,
  ModerationReport,
  PaymentRecord,
  ScannedBadgeContact,
} from '../types/domain';

export interface ProfileCompletenessResult {
  scorePct: number;
  completedCount: number;
  totalCount: number;
  missingLabels: string[];
}

export function computeProfileCompleteness(
  input: {
    fullName?: string;
    headline?: string;
    bio?: string;
    city?: string;
    country?: string;
    sectors?: string[];
    skills?: string[];
    activeCountries?: string[];
    collaborationNeeds?: string[];
    enterpriseName?: string;
    enterpriseSector?: string;
    voicePitchDataUrl?: string;
  },
  lang: 'fr' | 'en' = 'fr'
): ProfileCompletenessResult {
  const isEn = lang === 'en';
  const checks: Array<{ ok: boolean; label: string }> = [
    { ok: Boolean(input.fullName?.trim()), label: isEn ? 'Full name' : 'Nom complet' },
    { ok: Boolean(input.headline?.trim()), label: isEn ? 'Job title' : 'Titre professionnel' },
    { ok: Boolean(input.bio?.trim() && input.bio.trim().length >= 20), label: isEn ? 'Bio (20+ chars)' : 'Biographie (20+ car.)' },
    { ok: Boolean(input.city?.trim() && input.country?.trim()), label: isEn ? 'Location' : 'Localisation' },
    { ok: Boolean(input.sectors && input.sectors.length > 0), label: isEn ? 'Business sectors' : 'Secteurs d’activité' },
    { ok: Boolean(input.skills && input.skills.length > 0), label: isEn ? 'Key skills' : 'Compétences clés' },
    { ok: Boolean(input.activeCountries && input.activeCountries.length > 0), label: isEn ? 'Active countries' : 'Pays d’activité' },
    { ok: Boolean(input.collaborationNeeds && input.collaborationNeeds.length > 0), label: isEn ? 'Collaboration goals' : 'Collaborations recherchées' },
    { ok: Boolean(input.enterpriseName?.trim() && input.enterpriseSector?.trim()), label: isEn ? 'Company page' : 'Page entreprise' },
    { ok: Boolean(input.voicePitchDataUrl?.trim()), label: isEn ? 'Voice pitch' : 'Pitch vocal' },
  ];

  const completedCount = checks.filter((c) => c.ok).length;
  const totalCount = checks.length;
  const scorePct = Math.round((completedCount / totalCount) * 100);
  const missingLabels = checks.filter((c) => !c.ok).map((c) => c.label);

  return { scorePct, completedCount, totalCount, missingLabels };
}

export function buildBadgesCsv(badges: ScannedBadgeContact[], lang: 'fr' | 'en' = 'fr'): string {
  const header =
    lang === 'en'
      ? ['Full Name', 'Role', 'Company', 'Sector', 'Email', 'Phone', 'City', 'Country', 'LinkedIn', 'Event']
      : ['Nom complet', 'Fonction', 'Entreprise', 'Secteur', 'Email', 'Téléphone', 'Ville', 'Pays', 'LinkedIn', 'Événement'];
  const rows = badges.map((b) => [
    b.fullName,
    b.headline || '',
    b.companyName || '',
    b.sector || '',
    b.email || '',
    b.phone || '',
    b.city || '',
    b.country || '',
    b.linkedinUrl || '',
    b.eventTitle || '',
  ]);
  return [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function buildBadgeVcf(badge: ScannedBadgeContact): string {
  const cleanName = (badge.fullName || 'Contact Africa Entrepreneur').replace(/[\r\n]+/g, ' ').trim();
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${cleanName}`,
    badge.companyName ? `ORG:${badge.companyName.replace(/[\r\n]+/g, ' ').trim()}` : '',
    badge.headline ? `TITLE:${badge.headline.replace(/[\r\n]+/g, ' ').trim()}` : '',
    badge.email ? `EMAIL;TYPE=INTERNET:${badge.email.trim()}` : '',
    badge.phone ? `TEL;TYPE=CELL:${badge.phone.trim()}` : '',
    badge.city || badge.country
      ? `ADR;TYPE=WORK:;;${(badge.city || '').trim()};;;${(badge.country || '').trim()}`
      : '',
    badge.linkedinUrl ? `URL:${badge.linkedinUrl.trim()}` : '',
    badge.eventTitle ? `NOTE:Rencontré à ${badge.eventTitle.replace(/[\r\n]+/g, ' ').trim()}` : '',
    'END:VCARD',
  ].filter(Boolean);
  return lines.join('\r\n');
}

export interface SubscriptionComparison {
  annualEffectiveMonthlyEur: number;
  yearlySavingsEur: number;
  yearlySavingsPct: number;
}

export function computeSubscriptionComparison(monthlyEur: number, annualEur: number): SubscriptionComparison {
  const baselineYear = monthlyEur * 12;
  const yearlySavingsEur = Math.max(0, baselineYear - annualEur);
  const annualEffectiveMonthlyEur = Math.round((annualEur / 12) * 100) / 100;
  const yearlySavingsPct = baselineYear > 0 ? Math.round((yearlySavingsEur / baselineYear) * 100) : 0;
  return {
    annualEffectiveMonthlyEur,
    yearlySavingsEur,
    yearlySavingsPct,
  };
}

export interface OrganizerMetrics {
  totalEvents: number;
  publishedCount: number;
  totalCapacity: number;
  totalRegistered: number;
  fillRatePct: number;
  estimatedRevenueEur: number;
}

export function computeOrganizerMetrics(events: BusinessEvent[]): OrganizerMetrics {
  const totalEvents = events.length;
  const publishedCount = events.filter((e) => e.status === 'published').length;
  const totalCapacity = events.reduce((acc, e) => acc + Math.max(0, e.capacity || 0), 0);
  const totalRegistered = events.reduce((acc, e) => acc + Math.max(0, e.registeredCount || 0), 0);
  const fillRatePct = totalCapacity > 0 ? Math.min(100, Math.round((totalRegistered / totalCapacity) * 100)) : 0;
  const estimatedRevenueEur = events.reduce(
    (acc, e) => acc + Math.max(0, e.feeEur || 0) * Math.max(0, e.registeredCount || 0),
    0
  );
  return {
    totalEvents,
    publishedCount,
    totalCapacity,
    totalRegistered,
    fillRatePct,
    estimatedRevenueEur,
  };
}

export function verifyTicketCodeMatch(
  participants: EventParticipantSummary[],
  codeQuery: string
): EventParticipantSummary | null {
  const normalized = codeQuery.trim().toUpperCase();
  if (!normalized) return null;
  return (
    participants.find((p) => p.confirmationCode.trim().toUpperCase() === normalized) ||
    participants.find((p) => p.confirmationCode.trim().toUpperCase().includes(normalized)) ||
    null
  );
}

export interface AdminMetrics {
  totalRevenueEur: number;
  activeSubscribersCount: number;
  verifiedEnterprisesCount: number;
  totalEnterprisesCount: number;
  openReportsCount: number;
  publishedEventsCount: number;
}

export function computeAdminMetrics(input: {
  members: MemberAccount[];
  enterprises: EnterprisePage[];
  events: BusinessEvent[];
  payments: PaymentRecord[];
  reports: ModerationReport[];
}): AdminMetrics {
  const totalRevenueEur = input.payments
    .filter((p) => p.status === 'succeeded')
    .reduce((acc, p) => acc + Math.max(0, p.amountEur || 0), 0);
  const activeSubscribersCount = input.members.filter(
    (m) => m.subscriptionStatus === 'active'
  ).length;
  const verifiedEnterprisesCount = input.enterprises.filter((e) => e.verified).length;
  const totalEnterprisesCount = input.enterprises.length;
  const openReportsCount = input.reports.filter((r) => r.status === 'open').length;
  const publishedEventsCount = input.events.filter((e) => e.status === 'published').length;

  return {
    totalRevenueEur,
    activeSubscribersCount,
    verifiedEnterprisesCount,
    totalEnterprisesCount,
    openReportsCount,
    publishedEventsCount,
  };
}
