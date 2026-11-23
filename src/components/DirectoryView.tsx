import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BellRing,
  Building2,
  CalendarCheck,
  Camera,
  Check,
  Download,
  ExternalLink,
  Eye,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { apiFetch, queueOrSendMutation } from '../lib/apiClient';
import { hasActiveSubscription } from '../lib/accessRules';
import type { ParsedBadgeFields } from '../lib/badgeOcr';
import { buildIcsCalendar, selectEventsForCalendarSync } from '../lib/calendarSync';
import { REMINDER_LEAD_MINUTES, buildFavoriteReminderSchedule } from '../lib/eventReminders';
import {
  localeForLang,
  translateCountry,
  translateSector,
  type AppLanguage,
} from '../lib/i18n';
import { localizeDirectoryEntry } from '../lib/contentI18n';
import { writeOfflineCache } from '../lib/offlineSync';
import {
  buildBadgeVcf,
  buildBadgesCsv,
  computeProfileCompleteness,
} from '../lib/workspaceInsights';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { BadgeScannerModal } from './BadgeScannerModal';
import type {
  BusinessEvent,
  CalendarSyncScope,
  ContactConnection,
  DirectoryEntry,
  DirectoryPeerMatch,
  EnterprisePage,
  EventRegistration,
  MemberAccount,
  PeerMatchesResponse,
  ProfessionalProfile,
  ScannedBadgeContact,
} from '../types/domain';

interface BlockedMemberSummary {
  id: string;
  blockedId: string;
  blockedName?: string;
  createdAt: string;
}

interface DirectoryViewProps {
  user: MemberAccount | null;
  profile: ProfessionalProfile | null;
  enterprise: EnterprisePage | null;
  connections: ContactConnection[];
  blocks?: BlockedMemberSummary[];
  events?: BusinessEvent[];
  registrations?: EventRegistration[];
  favoriteEventIds?: string[];
  scannedBadges?: ScannedBadgeContact[];
  visibilityStats?: { profileViews: number; enterpriseViews: number };
  onlineUsers: string[];
  favoriteReminderEnabled?: boolean;
  notifPermission?: NotificationPermission | 'unsupported';
  onToggleFavoriteReminders?: (enabled: boolean) => Promise<void> | void;
  onRequestNotificationPermission?: () => Promise<void> | void;
  onTestFavoriteReminder?: () => Promise<boolean> | void;
  onRefresh: () => Promise<void>;
  onSaveBadgeContact?: (badge: ScannedBadgeContact) => Promise<void> | void;
  onGoToSubscription: () => void;
  onOpenChat: (peerId: string) => void;
  onOpenAuth: () => void;
  onAccountDeleted: () => Promise<void>;
  lang?: AppLanguage;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  user,
  profile,
  enterprise,
  connections,
  blocks = [],
  events = [],
  registrations = [],
  favoriteEventIds = [],
  scannedBadges = [],
  visibilityStats = { profileViews: 0, enterpriseViews: 0 },
  onlineUsers,
  favoriteReminderEnabled = true,
  notifPermission = 'default',
  onToggleFavoriteReminders,
  onRequestNotificationPermission,
  onTestFavoriteReminder,
  onRefresh,
  onSaveBadgeContact,
  onGoToSubscription,
  onOpenChat,
  onOpenAuth,
  onAccountDeleted,
  lang = 'fr',
}) => {
  const isEn = lang === 'en';
  const dateLocale = localeForLang(lang);
  const [reminderTestMsg, setReminderTestMsg] = useState<string | null>(null);
  const isSubscriber = hasActiveSubscription(user);
  const [subTab, setSubTab] = useState<'directory' | 'my_profile'>(isSubscriber ? 'directory' : 'my_profile');
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [badgeModalMode, setBadgeModalMode] = useState<'event_contact' | 'my_profile'>('event_contact');

  // Directory state
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [peerMatches, setPeerMatches] = useState<DirectoryPeerMatch[]>([]);
  const [dirSearch, setDirSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [collabFilter, setCollabFilter] = useState('all');
  const [contactTarget, setContactTarget] = useState<DirectoryEntry | null>(null);
  const [detailTarget, setDetailTarget] = useState<DirectoryEntry | null>(null);
  const [introMsg, setIntroMsg] = useState('');
  const [dirError, setDirError] = useState<string | null>(null);
  const [dirFeedback, setDirFeedback] = useState<string | null>(null);

  // Profile & Enterprise Editor state
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [country, setCountry] = useState(user?.country || '');
  const [city, setCity] = useState(user?.city || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [visibility, setVisibility] = useState<MemberAccount['visibility']>(user?.visibility || 'private');
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notificationsEnabled ?? true);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(user?.calendarSyncEnabled ?? false);
  const [calendarSyncScope, setCalendarSyncScope] = useState<CalendarSyncScope>(
    user?.calendarSyncScope || 'all_saved'
  );
  const [calendarLastSyncedAt, setCalendarLastSyncedAt] = useState<string | undefined>(
    user?.calendarLastSyncedAt
  );
  const [calendarSyncMsg, setCalendarSyncMsg] = useState<string | null>(null);
  const [calendarSyncBusy, setCalendarSyncBusy] = useState(false);
  const [headline, setHeadline] = useState(profile?.headline || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [sectorsText, setSectorsText] = useState((profile?.sectors || []).join(', '));
  const [skillsText, setSkillsText] = useState((profile?.skills || []).join(', '));
  const [activeCountriesText, setActiveCountriesText] = useState((profile?.activeCountries || []).join(', '));
  const [languagesText, setLanguagesText] = useState((profile?.languages || []).join(', '));
  const [needsText, setNeedsText] = useState((profile?.collaborationNeeds || []).join(', '));
  const [voicePitchDataUrl, setVoicePitchDataUrl] = useState(profile?.voicePitchDataUrl || '');
  const [voicePitchTranscript, setVoicePitchTranscript] = useState(profile?.voicePitchTranscript || '');

  const [entName, setEntName] = useState(enterprise?.name || '');
  const [entSector, setEntSector] = useState(enterprise?.sector || '');
  const [entDesc, setEntDesc] = useState(enterprise?.description || '');
  const [entServices, setEntServices] = useState((enterprise?.services || []).join(', '));
  const [entWebsite, setEntWebsite] = useState(enterprise?.websiteUrl || '');
  const [entLinkedin, setEntLinkedin] = useState(enterprise?.linkedinUrl || '');
  const [entLogoUrl, setEntLogoUrl] = useState(enterprise?.logoUrl || '');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [multimodalStatus, setMultimodalStatus] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const voiceRec = useVoiceRecorder();
  const cardInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setCountry(user.country);
      setCity(user.city);
      setAvatarUrl(user.avatarUrl || '');
      setVisibility(user.visibility);
      setNotificationsEnabled(user.notificationsEnabled);
      setCalendarSyncEnabled(Boolean(user.calendarSyncEnabled));
      setCalendarSyncScope(user.calendarSyncScope || 'all_saved');
      setCalendarLastSyncedAt(user.calendarLastSyncedAt);
    }
    if (profile) {
      setHeadline(profile.headline || '');
      setBio(profile.bio || '');
      setSectorsText((profile.sectors || []).join(', '));
      setSkillsText((profile.skills || []).join(', '));
      setActiveCountriesText((profile.activeCountries || []).join(', '));
      setLanguagesText((profile.languages || []).join(', '));
      setNeedsText((profile.collaborationNeeds || []).join(', '));
      setVoicePitchDataUrl(profile.voicePitchDataUrl || '');
      setVoicePitchTranscript(profile.voicePitchTranscript || '');
    }
    if (enterprise) {
      setEntName(enterprise.name || '');
      setEntSector(enterprise.sector || '');
      setEntDesc(enterprise.description || '');
      setEntServices((enterprise.services || []).join(', '));
      setEntWebsite(enterprise.websiteUrl || '');
      setEntLinkedin(enterprise.linkedinUrl || '');
      setEntLogoUrl(enterprise.logoUrl || '');
    }
  }, [user, profile, enterprise]);

  useEffect(() => {
    if (!user || !isSubscriber) {
      setEntries([]);
      setPeerMatches([]);
      return;
    }
    apiFetch<{ entries: DirectoryEntry[] }>('/api/directory')
      .then((res) => {
        setEntries(res.entries);
        setDirError(null);
      })
      .catch((err) => {
        setDirError(
          err instanceof Error
            ? err.message
            : isEn
              ? 'Failed to load directory.'
              : 'Erreur chargement annuaire.'
        );
      });

    apiFetch<PeerMatchesResponse>(`/api/analytics/peer-matches?lang=${lang}`)
      .then((res) => {
        setPeerMatches(res.matches || []);
      })
      .catch(() => {
        setPeerMatches([]);
      });
  }, [user, isSubscriber, lang, isEn]);

  const localizedEntries = useMemo(
    () => entries.map((e) => localizeDirectoryEntry(e, lang)),
    [entries, lang]
  );

  const filteredEntries = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    return localizedEntries.filter((e) => {
      if (
        countryFilter !== 'all' &&
        e.member.country !== countryFilter &&
        !(e.profile?.activeCountries || []).includes(countryFilter)
      ) {
        return false;
      }
      if (
        sectorFilter !== 'all' &&
        !e.profile?.sectors.includes(sectorFilter) &&
        e.enterprise?.sector !== sectorFilter
      ) {
        return false;
      }
      if (skillFilter !== 'all' && !(e.profile?.skills || []).includes(skillFilter)) {
        return false;
      }
      if (collabFilter !== 'all' && !(e.profile?.collaborationNeeds || []).includes(collabFilter)) {
        return false;
      }
      if (q) {
        return (
          e.member.fullName.toLowerCase().includes(q) ||
          e.member.city.toLowerCase().includes(q) ||
          (e.profile?.headline || '').toLowerCase().includes(q) ||
          (e.enterprise?.name || '').toLowerCase().includes(q) ||
          (e.profile?.skills || []).some((s) => s.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [localizedEntries, dirSearch, countryFilter, sectorFilter, skillFilter, collabFilter]);

  const countries = useMemo(
    () => Array.from(new Set(localizedEntries.map((e) => e.member.country))).sort(),
    [localizedEntries]
  );
  const allSkills = useMemo(
    () => Array.from(new Set(localizedEntries.flatMap((e) => e.profile?.skills || []))).sort(),
    [localizedEntries]
  );
  const allCollaborations = useMemo(
    () => Array.from(new Set(localizedEntries.flatMap((e) => e.profile?.collaborationNeeds || []))).sort(),
    [localizedEntries]
  );

  const getConnectionWith = (peerId: string) =>
    connections.find(
      (c) =>
        (c.senderId === user?.id && c.recipientId === peerId) ||
        (c.recipientId === user?.id && c.senderId === peerId)
    );

  const incomingRequests = connections.filter(
    (c) => c.recipientId === user?.id && c.status === 'pending'
  );

  const handleSendContactRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactTarget) return;
    try {
      await queueOrSendMutation({
        clientMutationId: `conn-${contactTarget.member.id}-${Date.now()}`,
        endpoint: '/api/connections',
        method: 'POST',
        body: {
          recipientId: contactTarget.member.id,
          introMessage:
            introMsg ||
            (isEn
              ? `Hello ${contactTarget.member.fullName}, delighted to connect on Africa Entrepreneur.`
              : `Bonjour ${contactTarget.member.fullName}, ravi d’échanger sur Africa Entrepreneur.`),
        },
        label: isEn
          ? `Contact request ${contactTarget.member.fullName}`
          : `Demande de contact ${contactTarget.member.fullName}`,
      });
      setDirFeedback(
        isEn
          ? `Request sent to ${contactTarget.member.fullName}.`
          : `Demande envoyée à ${contactTarget.member.fullName}.`
      );
      setContactTarget(null);
      setIntroMsg('');
      await onRefresh();
    } catch (err) {
      setDirError(err instanceof Error ? err.message : isEn ? 'Unable to send request.' : 'Envoi impossible.');
    }
  };

  const handleRespondConnection = async (connId: string, status: 'accepted' | 'declined') => {
    try {
      await apiFetch(`/api/connections/${connId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
    } catch (err) {
      setDirError(err instanceof Error ? err.message : isEn ? 'Update failed.' : 'Erreur de mise à jour.');
    }
  };

  const handleSaveProfileAndEnterprise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const splitList = (s: string) =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

      await queueOrSendMutation({
        clientMutationId: `profile-${Date.now()}`,
        endpoint: '/api/me/profile',
        method: 'PUT',
        body: {
          fullName,
          country,
          city,
          avatarUrl,
          visibility,
          notificationsEnabled,
          favoriteReminderEnabled,
          calendarSyncEnabled,
          calendarSyncScope,
          calendarLastSyncedAt,
          headline,
          bio,
          sectors: splitList(sectorsText),
          skills: splitList(skillsText),
          activeCountries: splitList(activeCountriesText),
          languages: splitList(languagesText),
          collaborationNeeds: splitList(needsText),
          voicePitchDataUrl,
          voicePitchTranscript,
        },
        label: isEn ? 'Profile update' : 'Mise à jour du profil',
      });

      if (entName.trim() && entSector.trim()) {
        await queueOrSendMutation({
          clientMutationId: `ent-${Date.now()}`,
          endpoint: '/api/me/enterprise',
          method: 'PUT',
          body: {
            name: entName,
            sector: entSector,
            description: entDesc,
            country,
            city,
            services: splitList(entServices),
            websiteUrl: entWebsite,
            linkedinUrl: entLinkedin,
            logoUrl: entLogoUrl,
          },
          label: isEn ? 'Company page update' : 'Mise à jour page entreprise',
        });
      }
      await onRefresh();
      setSaveMsg(
        isEn
          ? 'Professional profile and preferences saved.'
          : 'Profil professionnel et préférences enregistrés.'
      );
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : isEn ? 'Save failed.' : 'Erreur d’enregistrement.');
    } finally {
      setSaveBusy(false);
    }
  };

  const syncableCalendarItems = useMemo(
    () =>
      selectEventsForCalendarSync({
        events,
        registrations,
        favoriteEventIds,
        scope: calendarSyncScope,
      }),
    [events, registrations, favoriteEventIds, calendarSyncScope]
  );

  const upcomingFavoriteReminders = useMemo(
    () =>
      buildFavoriteReminderSchedule(
        events,
        favoriteEventIds,
        {},
        Date.now(),
        REMINDER_LEAD_MINUTES
      ).upcoming.slice(0, 3),
    [events, favoriteEventIds]
  );

  const handleToggleCalendarSync = async (checked: boolean) => {
    setCalendarSyncEnabled(checked);
    setCalendarSyncMsg(null);
    if (!user) return;
    try {
      const { queued } = await queueOrSendMutation({
        clientMutationId: `cal-pref-${Date.now()}`,
        endpoint: '/api/me/profile',
        method: 'PUT',
        body: {
          calendarSyncEnabled: checked,
          calendarSyncScope,
        },
        label: isEn ? 'Calendar sync preference' : 'Préférence synchronisation calendrier',
      });
      if (!queued) {
        await onRefresh();
      }
      setCalendarSyncMsg(
        checked
          ? isEn
            ? 'Calendar sync enabled (offline ready).'
            : 'Synchronisation agenda activée (prête hors ligne).'
          : isEn
            ? 'Automatic sync disabled.'
            : 'Synchronisation automatique désactivée.'
      );
    } catch {
      // Keep local toggle state
    }
  };

  const handleSyncSystemCalendarNow = async () => {
    setCalendarSyncBusy(true);
    setCalendarSyncMsg(null);
    try {
      const ics = buildIcsCalendar(syncableCalendarItems, {
        calendarName: user
          ? `Africa Entrepreneur — ${user.fullName}`
          : isEn
            ? 'Africa Entrepreneur — My Schedule'
            : 'Africa Entrepreneur — Mon Agenda',
      });
      const nowIso = new Date().toISOString();
      await writeOfflineCache('calendar_ics_snapshot', {
        ics,
        count: syncableCalendarItems.length,
        updatedAt: nowIso,
      });

      const fileName = 'africa-entrepreneur-agenda.ics';
      const icsFile = new File([ics], fileName, { type: 'text/calendar;charset=utf-8' });
      const navWithShare = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };

      let sharedNatively = false;
      if (typeof navWithShare.share === 'function' && navWithShare.canShare?.({ files: [icsFile] })) {
        try {
          await navWithShare.share({
            title: isEn ? 'Africa Entrepreneur — My Schedule' : 'Africa Entrepreneur — Mon Agenda',
            text: isEn
              ? 'Import my saved events into your device calendar'
              : 'Importer mes événements dans le calendrier de l’appareil',
            files: [icsFile],
          });
          sharedNatively = true;
        } catch {
          sharedNatively = false;
        }
      }

      if (!sharedNatively) {
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }

      setCalendarLastSyncedAt(nowIso);
      setCalendarSyncEnabled(true);
      if (user) {
        await queueOrSendMutation({
          clientMutationId: `cal-sync-${Date.now()}`,
          endpoint: '/api/me/profile',
          method: 'PUT',
          body: {
            calendarSyncEnabled: true,
            calendarSyncScope,
            calendarLastSyncedAt: nowIso,
          },
          label: isEn ? 'Device calendar sync' : 'Synchronisation calendrier appareil',
        });
        if (navigator.onLine) {
          await onRefresh();
        }
      }
      setCalendarSyncMsg(
        isEn
          ? `${syncableCalendarItems.length} event(s) exported to your device calendar (.ics offline ready).`
          : `${syncableCalendarItems.length} événement(s) exporté(s) vers le calendrier système (.ics hors ligne prêt).`
      );
    } catch (err) {
      setCalendarSyncMsg(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Calendar sync failed.'
            : 'Synchronisation calendrier impossible.'
      );
    } finally {
      setCalendarSyncBusy(false);
    }
  };

  const handleUploadDataUrl = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setter(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleUnblockMember = async (blockedId: string) => {
    await apiFetch(`/api/blocks/${blockedId}`, { method: 'DELETE' });
    await onRefresh();
  };

  const handleExportMyData = async () => {
    const data = await apiFetch<Record<string, unknown>>('/api/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `africa-entrepreneur-export-${user?.id || 'me'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    try {
      await apiFetch('/api/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      setDeleteModalOpen(false);
      await onAccountDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : isEn ? 'Deletion failed.' : 'Suppression impossible.');
    }
  };

  const handleToggleVoicePitch = async () => {
    setMultimodalStatus(null);
    if (voiceRec.isRecording) {
      const result = await voiceRec.stopRecording();
      if (result) {
        setVoicePitchDataUrl(result.dataUrl);
        setMultimodalStatus(
          isEn
            ? `Voice pitch recorded (${result.durationSec}s).`
            : `Pitch vocal enregistré (${result.durationSec}s).`
        );
        if (navigator.onLine) {
          try {
            const tr = await apiFetch<{ transcript: string }>('/api/multimodal/transcribe', {
              method: 'POST',
              body: JSON.stringify({ audioBase64: result.dataUrl, mimeType: result.mimeType }),
            });
            if (tr.transcript) {
              setVoicePitchTranscript(tr.transcript);
              setMultimodalStatus(
                isEn
                  ? 'Voice pitch recorded and automatically transcribed.'
                  : 'Pitch vocal enregistré et transcrit automatiquement.'
              );
            }
          } catch {
            // Transcription optional if Gemini key absent
          }
        }
      }
    } else {
      await voiceRec.startRecording();
    }
  };

  const handleImageCardScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMultimodalStatus(isEn ? 'Analyzing document image...' : 'Analyse visuelle du document en cours...');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = String(reader.result || '');
      try {
        const res = await apiFetch<{ analysis: string }>('/api/multimodal/analyze-image', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: dataUrl, mimeType: file.type || 'image/jpeg', context: 'profile' }),
        });
        const cleanJson = res.analysis.replace(/```json|```/g, '').trim();
        try {
          const parsed = JSON.parse(cleanJson) as {
            companyName?: string;
            sector?: string;
            headline?: string;
            summary?: string;
          };
          if (parsed.companyName) setEntName(parsed.companyName);
          if (parsed.sector) setEntSector(parsed.sector);
          if (parsed.headline) setHeadline(parsed.headline);
          if (parsed.summary) setEntDesc(parsed.summary);
          setMultimodalStatus(
            isEn
              ? 'Fields pre-filled from your business document.'
              : 'Champs pré-remplis depuis votre visuel professionnel.'
          );
        } catch {
          setEntDesc(res.analysis);
          setMultimodalStatus(
            isEn ? 'Visual analysis added to description.' : 'Analyse visuelle ajoutée à la description.'
          );
        }
      } catch (err) {
        setMultimodalStatus(
          err instanceof Error
            ? err.message
            : isEn
              ? 'Visual analysis unavailable offline or without server key.'
              : 'Analyse visuelle indisponible hors ligne ou sans clé serveur.'
        );
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-3 border-b border-[var(--ae-border)] pb-4">
        <div className="flex items-center justify-between gap-4 text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
          <span className="uppercase tracking-wider">
            {isEn ? 'Verified Network & Identity' : 'Réseau vérifié & Identité'}
          </span>
          <span className="font-mono tabular-nums">
            {isEn
              ? `${entries.length} leader(s) · ${scannedBadges.length} OCR badge(s)`
              : `${entries.length} dirigeant(s) · ${scannedBadges.length} badge(s) OCR`}
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Network & Profiles' : 'Réseau & Profils'}
              </h1>
              <ArrowUpRight className="h-5 w-5 text-[#E85002]" aria-hidden="true" />
            </div>
            <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
              {isEn
                ? 'Verified entrepreneur directory and management of your personal & company profile.'
                : 'Annuaire vérifié des entrepreneurs et gestion de votre fiche professionnelle & entreprise.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => {
                setBadgeModalMode('event_contact');
                setBadgeModalOpen(true);
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap"
            >
              <ScanLine className="h-3.5 w-3.5" />
              <span>{isEn ? 'Scan badge (OCR)' : 'Scanner badge (OCR)'}</span>
            </button>

            <div className="ios-segmented inline-flex">
              <button
                type="button"
                onClick={() => setSubTab('directory')}
                className={`min-h-[36px] rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap ${
                  subTab === 'directory'
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_14px_-4px_rgba(232,80,2,0.5)]'
                    : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                {isEn ? 'Directory & Contacts' : 'Annuaire & Contacts'}
              </button>
              <button
                type="button"
                onClick={() => setSubTab('my_profile')}
                className={`min-h-[36px] rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap ${
                  subTab === 'my_profile'
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_14px_-4px_rgba(232,80,2,0.5)]'
                    : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                {isEn ? 'My Profile & Company' : 'Mon Profil & Entreprise'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {subTab === 'directory' && (
        <>
          {!user || !isSubscriber ? (
            <div className="navy-card rounded-3xl p-6 sm:p-8 max-w-3xl mx-auto space-y-6 text-[#F9F9F9]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E85002]/20 border border-[#E85002]/40 text-[#E85002]">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#F9F9F9]">
                    {isEn
                      ? 'Executive Directory reserved for subscribers'
                      : 'Annuaire des dirigeants réservé aux abonnés'}
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-[#D9C3AB] leading-relaxed">
                    {isEn
                      ? 'Access verified profiles, Pan-African & diaspora corridors, Python affinity matches, and E2EE contact requests.'
                      : 'Accédez aux fiches vérifiées, aux corridors panafricains et diaspora, aux suggestions affinitaires Python et aux demandes de contact E2EE.'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 text-left text-xs">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1">
                  <p className="font-bold text-[#F16001]">
                    {isEn ? 'Multi-criteria filters' : 'Filtres multi-critères'}
                  </p>
                  <p className="text-[#A7A7A7]">
                    {isEn
                      ? 'Active countries, business sectors, skills, and collaboration goals.'
                      : 'Pays d’activité, secteurs, compétences et besoins de collaboration.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1">
                  <p className="font-bold text-[#F16001]">
                    {isEn ? 'Affinity matching' : 'Matching affinitaire'}
                  </p>
                  <p className="text-[#A7A7A7]">
                    {isEn
                      ? 'Python scoring across your sectors, corridors, and verified companies.'
                      : 'Scoring Python selon vos secteurs, corridors et entreprises vérifiées.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1">
                  <p className="font-bold text-[#F16001]">
                    {isEn ? 'E2EE introductions' : 'Mises en relation E2EE'}
                  </p>
                  <p className="text-[#A7A7A7]">
                    {isEn
                      ? 'Private ECDH P-256 encrypted chats and full company pages.'
                      : 'Échanges privés chiffrés ECDH P-256 et fiches entreprise complètes.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => (!user ? onOpenAuth() : onGoToSubscription())}
                  className="min-h-[46px] rounded-full orange-glow-btn px-6 text-sm font-semibold"
                >
                  {!user ? (isEn ? 'Sign in' : 'Se connecter') : isEn ? 'Activate a plan' : 'Activer un abonnement'}
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('my_profile')}
                  className="min-h-[46px] rounded-full border border-white/20 bg-white/5 px-5 text-xs font-semibold text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                >
                  {isEn ? 'Prepare my private profile' : 'Préparer mon profil privé'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Incoming Contact Requests (FR-15) */}
              {incomingRequests.length > 0 && (
                <div className="ice-panel rounded-3xl p-5 space-y-3">
                  <h2 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                    {isEn
                      ? `Pending contact requests (${incomingRequests.length})`
                      : `Demandes de contact en attente (${incomingRequests.length})`}
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {incomingRequests.map((req) => {
                      const senderEntry = entries.find((e) => e.member.id === req.senderId);
                      return (
                        <div
                          key={req.id}
                          className="porcelain-card flex flex-col justify-between gap-3 rounded-2xl p-4"
                        >
                          <div>
                            <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                              {senderEntry?.member.fullName || (isEn ? 'Member entrepreneur' : 'Entrepreneur membre')}
                            </p>
                            <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                              {senderEntry?.profile?.headline || (isEn ? 'Subscribed member' : 'Membre abonné')}
                            </p>
                            {req.introMessage && (
                              <p className="mt-2 text-xs text-[#333333] dark:text-[#D9C3AB] italic">
                                « {req.introMessage} »
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRespondConnection(req.id, 'accepted')}
                              className="min-h-[38px] flex-1 rounded-full orange-glow-btn text-xs font-semibold"
                            >
                              {isEn ? 'Accept' : 'Accepter'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRespondConnection(req.id, 'declined')}
                              className="min-h-[38px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-medium text-[#333333] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                            >
                              {isEn ? 'Decline' : 'Refuser'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Affinity Peer Suggestions */}
              {peerMatches.length > 0 && (
                <section className="ice-panel rounded-3xl p-5 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#E85002]" />
                      <h2 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                        {isEn ? 'Affinity Suggestions' : 'Suggestions affinitaires'}
                      </h2>
                    </div>
                    <span className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
                      {isEn
                        ? 'Matches scored by your sectors & corridors'
                        : 'Correspondances calculées selon vos secteurs & corridors'}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {peerMatches.map((match) => {
                      const matchedEntry = entries.find((e) => e.member.id === match.memberId);
                      const conn = getConnectionWith(match.memberId);
                      return (
                        <div
                          key={match.memberId}
                          className="porcelain-card rounded-2xl p-4 flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] leading-snug">
                                {match.fullName}
                              </p>
                              <span className="rounded-md bg-[#E85002] px-2 py-0.5 font-mono text-[10px] font-bold text-[#F9F9F9] shrink-0 tabular-nums">
                                {match.score}%
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] truncate">
                              {match.city}, {translateCountry(match.country, lang)}
                            </p>
                            {(match.enterpriseName || match.headline) && (
                              <p className="text-xs font-semibold text-[#E85002] line-clamp-1">
                                {match.enterpriseName || match.headline}
                              </p>
                            )}
                            <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] line-clamp-2 leading-relaxed">
                              {match.reason}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-[var(--ae-border)]">
                            {conn?.status === 'accepted' ? (
                              <button
                                type="button"
                                onClick={() => onOpenChat(match.memberId)}
                                className="w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-full orange-glow-btn px-3 text-xs font-semibold"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>{isEn ? 'E2EE Message' : 'Message E2EE'}</span>
                              </button>
                            ) : conn?.status === 'pending' ? (
                              <span className="block w-full text-center rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] py-1.5 text-[11px] font-semibold text-[#646464] dark:text-[#D9C3AB]">
                                {isEn ? 'Request sent' : 'Demande envoyée'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={!matchedEntry}
                                onClick={() => {
                                  if (matchedEntry) {
                                    setContactTarget(matchedEntry);
                                    apiFetch(`/api/directory/${matchedEntry.member.id}/view`, {
                                      method: 'POST',
                                    }).catch(() => {});
                                  }
                                }}
                                className="w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] border border-[var(--ae-border)] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:bg-[#E85002] hover:text-[#F9F9F9] hover:border-[#E85002] transition-colors disabled:opacity-50"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                <span>{isEn ? 'Connect' : 'Contacter'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Search & Filters (FR-14) */}
              <div className="porcelain-card rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                <div className="relative lg:col-span-2 flex items-center">
                  <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#A7A7A7]" />
                  <input
                    type="text"
                    aria-label={isEn ? 'Search a professional or company' : 'Rechercher un professionnel ou une entreprise'}
                    value={dirSearch}
                    onChange={(e) => setDirSearch(e.target.value)}
                    placeholder={isEn ? 'Name, skill, company...' : 'Nom, compétence, entreprise...'}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-10 pr-4 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#646464] dark:placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                  />
                </div>
                <select
                  aria-label={isEn ? 'Filter by country' : 'Filtrer par pays'}
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-2.5 text-xs font-medium text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                >
                  <option value="all">{isEn ? 'All countries' : 'Tous pays'}</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {translateCountry(c, lang)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={isEn ? 'Filter by sector' : 'Filtrer par secteur'}
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-2.5 text-xs font-medium text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                >
                  <option value="all">{isEn ? 'All sectors' : 'Tous secteurs'}</option>
                  {[
                    'Tech',
                    'Agriculture',
                    'Artisanat',
                    'Événementiel',
                    'BTT',
                    'Architecture',
                    'Design',
                    'Fintech',
                    'Capital-Risque',
                    'EdTech',
                    'Agro-industrie',
                  ].map((s) => (
                    <option key={s} value={s}>
                      {translateSector(s, lang)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={isEn ? 'Filter by skill' : 'Filtrer par compétence'}
                  value={skillFilter}
                  onChange={(e) => setSkillFilter(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-2.5 text-xs font-medium text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                >
                  <option value="all">{isEn ? 'Skills' : 'Compétences'}</option>
                  {allSkills.map((sk) => (
                    <option key={sk} value={sk}>
                      {sk}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={isEn ? 'Filter by collaboration' : 'Filtrer par collaboration'}
                  value={collabFilter}
                  onChange={(e) => setCollabFilter(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-2.5 text-xs font-medium text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                >
                  <option value="all">{isEn ? 'Collaboration' : 'Collaboration'}</option>
                  {allCollaborations.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              {(dirSearch ||
                countryFilter !== 'all' ||
                sectorFilter !== 'all' ||
                skillFilter !== 'all' ||
                collabFilter !== 'all') && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#646464] dark:text-[#A7A7A7]">
                  <span className="font-mono tabular-nums">
                    {isEn
                      ? `${filteredEntries.length} result(s) out of ${entries.length} leader(s)`
                      : `${filteredEntries.length} résultat(s) sur ${entries.length} dirigeant(s)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDirSearch('');
                      setCountryFilter('all');
                      setSectorFilter('all');
                      setSkillFilter('all');
                      setCollabFilter('all');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 py-1 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                  >
                    <RotateCcw className="h-3 w-3 text-[#E85002]" />
                    <span>{isEn ? 'Reset filters' : 'Réinitialiser les filtres'}</span>
                  </button>
                </div>
              )}

              {dirFeedback && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {dirFeedback}
                </div>
              )}
              {dirError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
                  {dirError}
                </div>
              )}

              {filteredEntries.length === 0 ? (
                <div className="porcelain-card rounded-3xl p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {isEn
                      ? 'No leaders match these filters.'
                      : 'Aucun dirigeant ne correspond à ces critères.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDirSearch('');
                      setCountryFilter('all');
                      setSectorFilter('all');
                      setSkillFilter('all');
                      setCollabFilter('all');
                    }}
                    className="min-h-[40px] rounded-full orange-glow-btn px-5 text-xs font-semibold"
                  >
                    {isEn ? 'Show full directory' : 'Afficher tout l’annuaire'}
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                {filteredEntries.map((entry) => {
                  const conn = getConnectionWith(entry.member.id);
                  const isOnline = onlineUsers.includes(entry.member.id);
                  return (
                    <article
                      key={entry.member.id}
                      className="porcelain-card flex flex-col justify-between rounded-3xl p-5 space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {entry.member.avatarUrl ? (
                              <img
                                src={entry.member.avatarUrl}
                                alt={entry.member.fullName}
                                referrerPolicy="no-referrer"
                                className="h-12 w-12 rounded-full object-cover ring-2 ring-[#E85002]/45 shrink-0"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E85002] text-sm font-semibold text-[#F9F9F9] shrink-0">
                                {entry.member.fullName
                                  .split(' ')
                                  .map((p) => p[0])
                                  .slice(0, 2)
                                  .join('')}
                              </div>
                            )}
                            <div className="min-w-0">
                              <h3 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9] truncate">
                                {entry.member.fullName}
                              </h3>
                              <p className="text-xs text-[#646464] dark:text-[#A7A7A7] truncate">
                                {entry.member.city}, {translateCountry(entry.member.country, lang)}
                                {isOnline ? (isEn ? ' · Online' : ' · En ligne') : ''}
                              </p>
                            </div>
                          </div>
                          {entry.member.keyFingerprint && (
                            <span className="rounded-lg bg-[#E85002]/15 border border-[#E85002]/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#E85002] shrink-0">
                              E2EE
                            </span>
                          )}
                        </div>

                        {entry.profile?.headline && (
                          <p className="text-sm font-semibold text-[#000000] dark:text-[#D9C3AB]">
                            {entry.profile.headline}
                          </p>
                        )}
                        {entry.profile?.bio && (
                          <p className="text-xs text-[#646464] dark:text-[#A7A7A7] line-clamp-2 leading-relaxed">
                            {entry.profile.bio}
                          </p>
                        )}

                        {entry.enterprise && (
                          <div className="ice-panel rounded-2xl p-3 flex items-center gap-2.5 text-xs">
                            <Building2 className="h-4 w-4 text-[#E85002] shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-[#000000] dark:text-[#F9F9F9] truncate">
                                {entry.enterprise.name}
                              </p>
                              <p className="text-[#646464] dark:text-[#A7A7A7] truncate">
                                {translateSector(entry.enterprise.sector, lang)} · {entry.enterprise.city}
                              </p>
                            </div>
                          </div>
                        )}

                        {entry.profile?.voicePitchDataUrl && (
                          <div className="pt-1">
                            <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                              {isEn ? 'Founder voice pitch' : 'Pitch vocal du fondateur'}
                            </p>
                            <audio controls src={entry.profile.voicePitchDataUrl} className="w-full h-8" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t border-[var(--ae-border)] pt-3.5">
                        <span className="text-xs text-[#646464] dark:text-[#A7A7A7] truncate">
                          {entry.profile?.collaborationNeeds.join(' · ') ||
                            (isEn ? 'Business network' : 'Réseau affaires')}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailTarget(entry);
                              apiFetch(`/api/directory/${entry.member.id}/view`, { method: 'POST' }).catch(() => {});
                            }}
                            className="min-h-[40px] inline-flex items-center gap-1 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#141417] px-3.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#E85002]" />
                            <span>{isEn ? 'Details' : 'Fiche'}</span>
                          </button>

                          {conn?.status === 'accepted' ? (
                            <button
                              type="button"
                              onClick={() => onOpenChat(entry.member.id)}
                              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{isEn ? 'E2EE Message' : 'Message E2EE'}</span>
                            </button>
                          ) : conn?.status === 'pending' ? (
                            <span className="rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] px-3 py-1 text-xs font-semibold text-[#646464] dark:text-[#D9C3AB] whitespace-nowrap">
                              {isEn ? 'Request pending' : 'Demande en attente'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setContactTarget(entry);
                                apiFetch(`/api/directory/${entry.member.id}/view`, { method: 'POST' }).catch(() => {});
                              }}
                              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] border border-[var(--ae-border)] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:bg-[#E85002] hover:text-[#F9F9F9] hover:border-[#E85002] transition-colors whitespace-nowrap"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>{isEn ? 'Connect' : 'Contacter'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Professional Profile & Enterprise Editor (FR-02, FR-03, FR-04 + §4.2 Visibility Stats + §12.3 GDPR) */}
      {subTab === 'my_profile' && (
        <div className="space-y-5">
          {user && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="ice-panel rounded-2xl p-4">
                <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-[#E85002]" />
                  <span>{isEn ? 'Profile views' : 'Vues profil'}</span>
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
                  {visibilityStats.profileViews}
                </p>
              </div>
              <div className="ice-panel rounded-2xl p-4">
                <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-[#E85002]" />
                  <span>{isEn ? 'Company views' : 'Vues entreprise'}</span>
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
                  {visibilityStats.enterpriseViews}
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportMyData}
                className="porcelain-card rounded-2xl p-4 text-left hover:border-[#E85002] transition-colors flex flex-col justify-between"
              >
                <Download className="h-4 w-4 text-[#E85002]" />
                <span className="mt-2 text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Export my data (JSON)' : 'Exporter mes données (JSON)'}
                </span>
              </button>
              {user.role !== 'admin' && (
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  className="porcelain-card rounded-2xl p-4 text-left hover:border-red-400 hover:bg-red-500/10 transition-colors flex flex-col justify-between"
                >
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span className="mt-2 text-xs font-bold text-red-700 dark:text-red-300">
                    {isEn ? 'Delete my account' : 'Supprimer mon compte'}
                  </span>
                </button>
              )}
            </div>
          )}

        {(() => {
          const splitVals = (raw: string) =>
            raw
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean);
          const completeness = computeProfileCompleteness(
            {
              fullName,
              headline,
              bio,
              city,
              country,
              sectors: splitVals(sectorsText),
              skills: splitVals(skillsText),
              activeCountries: splitVals(activeCountriesText),
              collaborationNeeds: splitVals(needsText),
              enterpriseName: entName,
              enterpriseSector: entSector,
              voicePitchDataUrl,
            },
            lang
          );
          return (
            <div className="navy-card rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-[#F9F9F9]">
                    {isEn ? 'Profile Passport' : 'Passeport Profil'}
                  </h2>
                  <ArrowUpRight className="h-4 w-4 text-[#E85002]" aria-hidden="true" />
                </div>
                <span className="font-mono text-xs text-[#D9C3AB] tabular-nums">
                  {isEn
                    ? `Completeness ${completeness.scorePct}% · ${scannedBadges.length} OCR badge(s)`
                    : `Complétude ${completeness.scorePct}% · ${scannedBadges.length} badge(s) OCR`}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#E85002] to-[#F16001] transition-all duration-300"
                    style={{ width: `${completeness.scorePct}%` }}
                  />
                </div>
                {completeness.missingLabels.length > 0 ? (
                  <p className="text-[11px] text-[#A7A7A7]">
                    {isEn
                      ? `To complete (${completeness.completedCount}/${completeness.totalCount}): `
                      : `À compléter (${completeness.completedCount}/{completeness.totalCount}) : `}
                    <span className="text-[#D9C3AB]">{completeness.missingLabels.join(', ')}</span>
                  </p>
                ) : (
                  <p className="text-[11px] font-semibold text-emerald-400">
                    {isEn
                      ? `Profile complete (${completeness.completedCount}/${completeness.totalCount}) — ready for affinity matching.`
                      : `Profil complet (${completeness.completedCount}/${completeness.totalCount}) — prêt pour le matching affinitaire.`}
                  </p>
                )}
              </div>

              <div className="divide-y divide-white/10 text-xs">
                {[
                  {
                    k: isEn ? 'Identity & Role' : 'Identité & Titre',
                    v: [fullName, headline].filter(Boolean).join(' · ') || (isEn ? 'To complete' : 'À compléter'),
                  },
                  {
                    k: isEn ? 'Company' : 'Entreprise',
                    v: entName || (isEn ? 'To complete' : 'À compléter'),
                  },
                  {
                    k: isEn ? 'Primary Sector' : 'Secteur principal',
                    v: entSector
                      ? translateSector(entSector, lang)
                      : sectorsText || (isEn ? 'Entrepreneurship' : 'Entrepreneuriat'),
                  },
                  {
                    k: isEn ? 'Location' : 'Localisation',
                    v:
                      [city, country ? translateCountry(country, lang) : ''].filter(Boolean).join(', ') ||
                      (isEn ? 'Africa & Diaspora' : 'Afrique & Diaspora'),
                  },
                ].map((row) => (
                  <div key={row.k} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-[#A7A7A7]">{row.k}</span>
                    <span className="font-semibold text-[#F9F9F9] truncate max-w-[60%] text-right">{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <form onSubmit={handleSaveProfileAndEnterprise} className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 porcelain-card rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    referrerPolicy="no-referrer"
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-[#E85002]/50"
                  />
                ) : null}
                <div>
                  <h2 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
                    {isEn ? 'Professional profile' : 'Profil professionnel'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="text-[11px] font-semibold text-[#E85002] hover:underline"
                  >
                    {isEn ? 'Change photo' : 'Changer la photo'}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleUploadDataUrl(e, setAvatarUrl)}
                    className="hidden"
                  />
                </div>
              </div>
              <span className="rounded-full bg-[#E85002]/12 border border-[#E85002]/25 px-3 py-1 text-[11px] font-semibold text-[#E85002]">
                {isSubscriber
                  ? isEn
                    ? 'Visible per privacy settings'
                    : 'Visible selon confidentialité'
                  : isEn
                    ? 'Managed privately'
                    : 'Géré en privé'}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Full name' : 'Nom complet'}
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="prof-visibility" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Profile visibility' : 'Visibilité du profil'}
                </label>
                <select
                  id="prof-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as MemberAccount['visibility'])}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                >
                  <option value="public_subscribers">
                    {isEn ? 'Visible to subscribed members' : 'Visible aux membres abonnés'}
                  </option>
                  <option value="connections_only">
                    {isEn ? 'Accepted connections only' : 'Contacts acceptés uniquement'}
                  </option>
                  <option value="private">
                    {isEn ? 'Private (hidden from directory)' : 'Privé (masqué de l’annuaire)'}
                  </option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="prof-country" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Country of residence' : 'Pays de résidence'}
                </label>
                <input
                  id="prof-country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="prof-city" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'City' : 'Ville'}
                </label>
                <input
                  id="prof-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="prof-headline" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Professional headline' : 'Titre professionnel'}
              </label>
              <input
                id="prof-headline"
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={
                  isEn
                    ? 'e.g. Founder — West Africa Logistics Solutions'
                    : 'Ex: Fondateur — Solutions logistiques Afrique de l’Ouest'
                }
                className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prof-bio" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Bio & Activities' : 'Biographie & Activités'}
              </label>
              <textarea
                id="prof-bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="prof-sectors" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Sectors (comma-separated)' : 'Secteurs (séparés par virgule)'}
                </label>
                <input
                  id="prof-sectors"
                  type="text"
                  value={sectorsText}
                  onChange={(e) => setSectorsText(e.target.value)}
                  placeholder={isEn ? 'Fintech, Energy' : 'Fintech, Énergie'}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="prof-skills" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Skills' : 'Compétences'}
                </label>
                <input
                  id="prof-skills"
                  type="text"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  placeholder={isEn ? 'Fundraising, Export' : 'Levée de fonds, Export'}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="prof-active-countries" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Active countries (comma-separated)' : 'Pays d’activité (séparés par virgule)'}
                </label>
                <input
                  id="prof-active-countries"
                  type="text"
                  value={activeCountriesText}
                  onChange={(e) => setActiveCountriesText(e.target.value)}
                  placeholder={isEn ? 'Senegal, Côte d’Ivoire, France' : 'Sénégal, Côte d’Ivoire, France'}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="prof-languages" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Spoken languages' : 'Langues parlées'}
                </label>
                <input
                  id="prof-languages"
                  type="text"
                  value={languagesText}
                  onChange={(e) => setLanguagesText(e.target.value)}
                  placeholder={isEn ? 'French, English' : 'Français, Anglais'}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="prof-needs" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Collaboration goals' : 'Collaborations recherchées'}
              </label>
              <input
                id="prof-needs"
                type="text"
                value={needsText}
                onChange={(e) => setNeedsText(e.target.value)}
                placeholder={isEn ? 'Co-investment, Distributors' : 'Co-investissement, Distributeurs'}
                className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
              />
            </div>

            {/* Multimodal Voice Pitch */}
            <div className="ice-panel rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                    {isEn ? 'Audio intro pitch' : 'Pitch vocal de présentation'}
                  </p>
                  <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7]">
                    {isEn
                      ? 'Record your audio introduction (multimodal voice)'
                      : 'Enregistrez votre présentation audio (multimodal voix)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleVoicePitch}
                  className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-colors ${
                    voiceRec.isRecording ? 'bg-red-600 text-white' : 'orange-glow-btn'
                  }`}
                >
                  {voiceRec.isRecording ? (
                    <>
                      <MicOff className="h-3.5 w-3.5" />
                      <span>{isEn ? `Stop (${voiceRec.durationSec}s)` : `Arrêter (${voiceRec.durationSec}s)`}</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5" />
                      <span>{isEn ? 'Record pitch' : 'Enregistrer un pitch'}</span>
                    </>
                  )}
                </button>
              </div>
              {voicePitchDataUrl && <audio controls src={voicePitchDataUrl} className="w-full h-9" />}
              {voicePitchTranscript && (
                <p className="text-xs text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Transcript:' : 'Transcription :'} {voicePitchTranscript}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2.5 text-xs text-[#646464] dark:text-[#A7A7A7] cursor-pointer">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#E85002]"
              />
              <span>
                {isEn
                  ? 'Receive notifications for contact requests, messages, and events'
                  : 'Recevoir les notifications de demandes de contact, messages et événements'}
              </span>
            </label>

            {/* System Device Calendar Sync (iOS / Android Offline-First) */}
            <div className="rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E85002] text-[#F9F9F9]">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {isEn
                        ? 'System calendar sync (iOS / Android)'
                        : 'Synchronisation calendrier système (iOS / Android)'}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[#646464] dark:text-[#A7A7A7] leading-relaxed">
                      {isEn
                        ? 'Sync your saved events in iCalendar (.ics) format with automatic 1-hour reminders to view your schedule offline.'
                        : 'Synchronisez vos événements enregistrés au format iCalendar (.ics) avec rappels automatiques 1 h avant pour consulter votre agenda hors ligne.'}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9] shrink-0 tabular-nums">
                  {syncableCalendarItems.length} {isEn ? 'ready' : 'prêt(s)'}
                </span>
              </div>

              <label
                htmlFor="prof-calendar-sync"
                className="flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-3.5 py-2.5 cursor-pointer"
              >
                <span className="text-xs font-semibold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn
                    ? 'Enable device calendar synchronization'
                    : 'Activer la synchronisation calendrier de l’appareil'}
                </span>
                <span className="relative inline-flex items-center shrink-0">
                  <input
                    id="prof-calendar-sync"
                    type="checkbox"
                    checked={calendarSyncEnabled}
                    onChange={(e) => handleToggleCalendarSync(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className="h-7 w-12 rounded-full bg-[#A7A7A7]/40 dark:bg-[#333333] transition-colors peer-checked:bg-[#E85002]" />
                  <span className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                </span>
              </label>

              <div className="grid gap-2.5 sm:grid-cols-2 sm:items-end">
                <div>
                  <label htmlFor="prof-calendar-scope" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                    {isEn ? 'Events to sync' : 'Événements à synchroniser'}
                  </label>
                  <select
                    id="prof-calendar-scope"
                    value={calendarSyncScope}
                    onChange={(e) => setCalendarSyncScope(e.target.value as CalendarSyncScope)}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] px-3 text-xs font-medium text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                  >
                    <option value="all_saved">
                      {isEn ? 'Registrations + Favorites' : 'Inscriptions + Favoris'}
                    </option>
                    <option value="registered_only">
                      {isEn ? 'Confirmed registrations only' : 'Inscriptions confirmées uniquement'}
                    </option>
                    <option value="favorites_only">
                      {isEn ? 'Favorite events only' : 'Événements favoris uniquement'}
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  disabled={calendarSyncBusy || syncableCalendarItems.length === 0}
                  onClick={handleSyncSystemCalendarNow}
                  className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-full orange-glow-btn px-4 text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                >
                  {calendarSyncBusy ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CalendarCheck className="h-3.5 w-3.5" />
                  )}
                  <span>{isEn ? 'Sync calendar (.ics)' : 'Synchroniser l’agenda (.ics)'}</span>
                </button>
              </div>

              {calendarLastSyncedAt && (
                <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7]">
                  {isEn ? 'Last local sync: ' : 'Dernière synchronisation locale : '}
                  <span className="font-mono font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {new Date(calendarLastSyncedAt).toLocaleString(dateLocale, {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </p>
              )}

              {calendarSyncMsg && (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  {calendarSyncMsg}
                </p>
              )}
            </div>

            {/* Local Push Reminders 30 min Before Saved Favorite Events (Service Worker Background) */}
            <div className="rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E85002] text-[#F9F9F9]">
                    {favoriteReminderEnabled && notifPermission === 'granted' ? (
                      <BellRing className="h-4 w-4" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {isEn
                        ? 'Local Push Reminders (30 min before favorites)'
                        : 'Rappels Push locaux (30 min avant favoris)'}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[#646464] dark:text-[#A7A7A7] leading-relaxed">
                      {isEn
                        ? 'Schedules local notifications via Service Worker 30 minutes before your favorite events start, even in the background.'
                        : 'Planifie des notifications locales via Service Worker 30 minutes avant le début de vos événements favoris, même lorsque l’app fonctionne en arrière-plan.'}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9] shrink-0 tabular-nums">
                  {favoriteEventIds.length} {isEn ? 'saved' : 'favori(s)'}
                </span>
              </div>

              <label
                htmlFor="prof-fav-reminders"
                className="flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-3.5 py-2.5 cursor-pointer"
              >
                <span className="text-xs font-semibold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn
                    ? 'Alert 30 min before each favorite event'
                    : 'Alerter 30 min avant chaque événement favori'}
                </span>
                <span className="relative inline-flex items-center shrink-0">
                  <input
                    id="prof-fav-reminders"
                    type="checkbox"
                    checked={favoriteReminderEnabled}
                    onChange={(e) => onToggleFavoriteReminders?.(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className="h-7 w-12 rounded-full bg-[#A7A7A7]/40 dark:bg-[#333333] transition-colors peer-checked:bg-[#E85002]" />
                  <span className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-[#646464] dark:text-[#A7A7A7]">
                  {isEn ? 'Browser status: ' : 'Statut navigateur : '}
                  <strong className="text-[#000000] dark:text-[#F9F9F9]">
                    {notifPermission === 'granted'
                      ? isEn
                        ? 'Allowed (Service Worker ready)'
                        : 'Autorisées (Service Worker prêt)'
                      : notifPermission === 'denied'
                        ? isEn
                          ? 'Blocked in browser'
                          : 'Bloquées dans le navigateur'
                        : notifPermission === 'unsupported'
                          ? isEn
                            ? 'Unsupported'
                            : 'Non supportées'
                          : isEn
                            ? 'Permission required'
                            : 'Autorisation requise'}
                  </strong>
                </span>

                <div className="flex items-center gap-2">
                  {notifPermission !== 'granted' && notifPermission !== 'unsupported' && notifPermission !== 'denied' && (
                    <button
                      type="button"
                      onClick={() => onRequestNotificationPermission?.()}
                      className="min-h-[36px] rounded-full orange-glow-btn px-3.5 text-xs font-semibold"
                    >
                      {isEn ? 'Allow' : 'Autoriser'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      setReminderTestMsg(null);
                      const ok = await onTestFavoriteReminder?.();
                      setReminderTestMsg(
                        ok
                          ? isEn
                            ? 'Local notification sent via Service Worker and added to the bell.'
                            : 'Notification locale envoyée via Service Worker et ajoutée à la cloche.'
                          : isEn
                            ? 'Reminder added to the bell (enable system notifications for background display).'
                            : 'Rappel ajouté à la cloche (autorisez les notifications système pour l’affichage hors fenêtre).'
                      );
                    }}
                    className="min-h-[36px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#121214] px-3.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                  >
                    {isEn ? 'Test local alert' : 'Tester notification locale'}
                  </button>
                </div>
              </div>

              {upcomingFavoriteReminders.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold text-[#646464] dark:text-[#A7A7A7]">
                    {isEn ? 'Upcoming scheduled alerts (-30 min):' : 'Prochains rappels programmés (-30 min) :'}
                  </p>
                  {upcomingFavoriteReminders.map((rem) => (
                    <div
                      key={rem.reminderKey}
                      className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-3 py-1.5 text-[11px]"
                    >
                      <span className="font-semibold text-[#000000] dark:text-[#F9F9F9] truncate">
                        {rem.event.title}
                      </span>
                      <span className="font-mono text-[#E85002] shrink-0">
                        {new Date(rem.triggerAtMs).toLocaleDateString(dateLocale, {
                          day: '2-digit',
                          month: 'short',
                        })}{' '}
                        {new Date(rem.triggerAtMs).toLocaleTimeString(dateLocale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {reminderTestMsg && (
                <p className="rounded-xl border border-[#E85002]/30 bg-white dark:bg-[#121214] px-3 py-2 text-[11px] font-medium text-[#000000] dark:text-[#F9F9F9]">
                  {reminderTestMsg}
                </p>
              )}
            </div>
          </div>

          {/* Right column: Enterprise Page + Multimodal Visual Scanner */}
          <div className="lg:col-span-5 space-y-5">
            <div className="porcelain-card rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Company page' : 'Page d’entreprise'}
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBadgeModalMode('my_profile');
                      setBadgeModalOpen(true);
                    }}
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-full orange-glow-btn px-3 text-xs font-semibold"
                  >
                    <ScanLine className="h-3.5 w-3.5" />
                    <span>{isEn ? 'OCR Camera' : 'Caméra OCR'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cardInputRef.current?.click()}
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-full bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5 text-[#E85002]" />
                    <span>{isEn ? 'File' : 'Fichier'}</span>
                  </button>
                </div>
                <input
                  ref={cardInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageCardScan}
                  className="hidden"
                />
              </div>

              {multimodalStatus && (
                <p className="rounded-xl bg-[#E85002]/12 border border-[#E85002]/25 px-3 py-2 text-xs font-medium text-[#000000] dark:text-[#F9F9F9]">
                  {multimodalStatus}
                </p>
              )}

              <div>
                <label htmlFor="ent-name" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Company name' : 'Nom de l’entreprise'}
                </label>
                <input
                  id="ent-name"
                  type="text"
                  value={entName}
                  onChange={(e) => setEntName(e.target.value)}
                  placeholder={isEn ? 'e.g. PayTeranga SAS' : 'Ex: PayTeranga SAS'}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ent-sector" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Primary sector' : 'Secteur principal'}
                </label>
                <input
                  id="ent-sector"
                  type="text"
                  value={entSector}
                  onChange={(e) => setEntSector(e.target.value)}
                  placeholder={isEn ? 'e.g. Fintech' : 'Ex: Fintech'}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ent-desc" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Overview & Offering' : 'Présentation & Offre'}
                </label>
                <textarea
                  id="ent-desc"
                  rows={3}
                  value={entDesc}
                  onChange={(e) => setEntDesc(e.target.value)}
                  className="w-full rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ent-services" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Products / Services' : 'Produits / Services'}
                </label>
                <input
                  id="ent-services"
                  type="text"
                  value={entServices}
                  onChange={(e) => setEntServices(e.target.value)}
                  placeholder={isEn ? 'Payment API, Export Advisory' : 'API Paiement, Conseil Export'}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ent-web" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                    {isEn ? 'Website' : 'Site web'}
                  </label>
                  <input
                    id="ent-web"
                    type="url"
                    value={entWebsite}
                    onChange={(e) => setEntWebsite(e.target.value)}
                    placeholder="https://..."
                    className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ent-linkedin" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                    {isEn ? 'Company LinkedIn' : 'LinkedIn entreprise'}
                  </label>
                  <input
                    id="ent-linkedin"
                    type="url"
                    value={entLinkedin}
                    onChange={(e) => setEntLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/company/..."
                    className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 py-2.5 text-xs">
                <span className="font-medium text-[#646464] dark:text-[#A7A7A7]">
                  {isEn
                    ? `Company logo ${entLogoUrl ? 'uploaded' : '(optional)'}`
                    : `Logo entreprise ${entLogoUrl ? 'chargé' : '(optionnel)'}`}
                </span>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-full bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-3 py-1 font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                >
                  {isEn ? 'Upload logo' : 'Importer logo'}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUploadDataUrl(e, setEntLogoUrl)}
                  className="hidden"
                />
              </div>

              {user?.keyFingerprint && (
                <div className="ice-panel rounded-2xl p-3.5 flex items-center gap-2.5 text-xs">
                  <ShieldCheck className="h-4 w-4 text-[#E85002] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {isEn ? 'E2EE Cryptographic Fingerprint' : 'Empreinte cryptographique E2EE'}
                    </p>
                    <p className="font-mono text-[11px] text-[#646464] dark:text-[#A7A7A7] truncate">
                      {user.keyFingerprint}
                    </p>
                  </div>
                </div>
              )}

              {saveMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{saveMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={saveBusy}
                className="w-full min-h-[48px] rounded-full orange-glow-btn text-sm font-semibold disabled:opacity-60"
              >
                {saveBusy
                  ? isEn
                    ? 'Saving...'
                    : 'Enregistrement...'
                  : isEn
                    ? 'Save profile and company'
                    : 'Enregistrer profil et entreprise'}
              </button>
            </div>

            {blocks.length > 0 && (
              <div className="porcelain-card rounded-3xl p-5 space-y-2.5">
                <h3 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Blocked members' : 'Membres bloqués'}
                </h3>
                <div className="divide-y divide-[var(--ae-border)]">
                  {blocks.map((blk) => (
                    <div key={blk.id} className="flex items-center justify-between py-2 text-xs">
                      <span className="font-medium text-[#000000] dark:text-[#F9F9F9]">
                        {blk.blockedName || blk.blockedId}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUnblockMember(blk.blockedId)}
                        className="rounded-full bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3 py-1 font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                      >
                        {isEn ? 'Unblock' : 'Débloquer'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>
        </div>
      )}

      {/* Contact Request Modal */}
      {contactTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSendContactRequest}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? `Contact ${contactTarget.member.fullName}` : `Contacter ${contactTarget.member.fullName}`}
              </h3>
              <button
                type="button"
                onClick={() => setContactTarget(null)}
                aria-label={isEn ? 'Close' : 'Fermer'}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:bg-[#F3EFEA] dark:hover:bg-[#1E1E22]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
              {isEn
                ? 'Once the request is accepted, you can exchange end-to-end encrypted messages, images, and voice notes.'
                : 'Une fois la demande acceptée, vous pourrez échanger des messages, images et notes vocales chiffrés de bout en bout.'}
            </p>
            <div>
              <label htmlFor="intro-msg" className="sr-only">
                {isEn ? 'Introduction message' : 'Message d’introduction'}
              </label>
              <textarea
                id="intro-msg"
                rows={3}
                value={introMsg}
                onChange={(e) => setIntroMsg(e.target.value)}
                placeholder={
                  isEn
                    ? 'Briefly introduce the reason for reaching out...'
                    : 'Présentez brièvement l’objet de votre prise de contact...'
                }
                className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[46px] rounded-full orange-glow-btn text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              <span>{isEn ? 'Send request' : 'Envoyer la demande'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Account Deletion Modal */}
      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmDeleteAccount}
            className="w-full max-w-md rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
              {isEn ? 'Delete my account' : 'Supprimer mon compte'}
            </h3>
            <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
              {isEn
                ? 'This action permanently deletes your profile, event registrations, and company page. Enter your password to confirm.'
                : 'Cette action supprime définitivement votre profil, vos inscriptions et votre fiche entreprise. Saisissez votre mot de passe pour confirmer.'}
            </p>
            <input
              type="password"
              required
              aria-label={isEn ? 'Confirmation password' : 'Mot de passe de confirmation'}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder={isEn ? 'Current password' : 'Mot de passe actuel'}
              className="w-full min-h-[44px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
            />
            {deleteError && <p className="text-xs font-medium text-red-600 dark:text-red-400">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="min-h-[40px] rounded-full border border-[var(--ae-border)] px-4 text-xs font-semibold text-[#646464] dark:text-[#A7A7A7]"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-full bg-red-600 px-5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {isEn ? 'Delete permanently' : 'Supprimer définitivement'}
              </button>
            </div>
          </form>
        </div>
      )}
      {scannedBadges.length > 0 && (
        <section className="porcelain-card rounded-3xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-[#E85002]" />
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'In-person scanned badges (OCR)' : 'Badges scannés en présentiel (OCR)'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#646464] dark:text-[#A7A7A7] tabular-nums">
                {scannedBadges.length} {isEn ? (scannedBadges.length === 1 ? 'contact' : 'contacts') : 'contact(s)'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const csv = buildBadgesCsv(scannedBadges, lang);
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'badges-africa-entrepreneur.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="min-h-[34px] inline-flex items-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-[#E85002]" />
                <span>{isEn ? 'Export CRM (.csv)' : 'Exporter CRM (.csv)'}</span>
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scannedBadges.map((b) => (
              <div key={b.id} className="ice-panel rounded-2xl p-4 flex flex-col justify-between gap-2 text-xs">
                <div className="space-y-1.5">
                  <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">{b.fullName}</p>
                  {b.headline && <p className="font-medium text-[#E85002]">{b.headline}</p>}
                  {(b.companyName || b.sector) && (
                    <p className="text-[#646464] dark:text-[#A7A7A7]">
                      {[b.companyName, b.sector ? translateSector(b.sector, lang) : ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {(b.email || b.phone) && (
                    <p className="font-mono text-[11px] text-[#646464] dark:text-[#A7A7A7] break-all">
                      {[b.email, b.phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {b.eventTitle && (
                    <p className="pt-1 text-[10px] font-medium text-[#646464] dark:text-[#A7A7A7]">
                      {isEn ? 'Event:' : 'Événement :'} {b.eventTitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const vcf = buildBadgeVcf(b);
                    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${b.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'contact'}.vcf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="mt-1 self-start min-h-[30px] inline-flex items-center gap-1 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#121214] px-2.5 text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                >
                  <UserCheck className="h-3 w-3 text-[#E85002]" />
                  <span>vCard (.vcf)</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Directory Member Detail Modal */}
      {detailTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#E85002]">
                  {detailTarget.member.city}, {translateCountry(detailTarget.member.country, lang)}
                </p>
                <h3 className="text-xl font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {detailTarget.member.fullName}
                </h3>
                {detailTarget.profile?.headline && (
                  <p className="text-sm font-medium text-[#646464] dark:text-[#D9C3AB]">
                    {detailTarget.profile.headline}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                aria-label={isEn ? 'Close profile' : 'Fermer la fiche'}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:bg-[#F3EFEA] dark:hover:bg-[#1E1E22]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailTarget.profile?.bio && (
              <p className="text-sm text-[#333333] dark:text-[#D9C3AB] leading-relaxed">
                {detailTarget.profile.bio}
              </p>
            )}

            <div className="ice-panel rounded-2xl p-4 space-y-2 text-xs">
              {detailTarget.profile?.sectors?.length ? (
                <p>
                  <span className="font-semibold text-[#646464] dark:text-[#A7A7A7]">
                    {isEn ? 'Sectors: ' : 'Secteurs : '}
                  </span>
                  <span className="font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {detailTarget.profile.sectors.map((s) => translateSector(s, lang)).join(' · ')}
                  </span>
                </p>
              ) : null}
              {detailTarget.profile?.skills?.length ? (
                <p>
                  <span className="font-semibold text-[#646464] dark:text-[#A7A7A7]">
                    {isEn ? 'Skills: ' : 'Compétences : '}
                  </span>
                  <span className="font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {detailTarget.profile.skills.join(' · ')}
                  </span>
                </p>
              ) : null}
              {detailTarget.profile?.activeCountries?.length ? (
                <p>
                  <span className="font-semibold text-[#646464] dark:text-[#A7A7A7]">
                    {isEn ? 'Corridors: ' : 'Corridors : '}
                  </span>
                  <span className="font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {detailTarget.profile.activeCountries.map((c) => translateCountry(c, lang)).join(' · ')}
                  </span>
                </p>
              ) : null}
              {detailTarget.profile?.languages?.length ? (
                <p>
                  <span className="font-semibold text-[#646464] dark:text-[#A7A7A7]">
                    {isEn ? 'Languages: ' : 'Langues : '}
                  </span>
                  <span className="font-semibold text-[#000000] dark:text-[#F9F9F9]">
                    {detailTarget.profile.languages.join(' · ')}
                  </span>
                </p>
              ) : null}
            </div>

            {detailTarget.enterprise && (
              <div className="rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-4 space-y-1.5 text-xs">
                <p className="font-bold text-[#000000] dark:text-[#F9F9F9] flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-[#E85002]" />
                  <span>{detailTarget.enterprise.name}</span>
                  {detailTarget.enterprise.verified && (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {isEn ? '· Verified' : '· Vérifiée'}
                    </span>
                  )}
                </p>
                {detailTarget.enterprise.description && (
                  <p className="text-[#646464] dark:text-[#A7A7A7] leading-relaxed">
                    {detailTarget.enterprise.description}
                  </p>
                )}
                {detailTarget.enterprise.websiteUrl && (
                  <a
                    href={detailTarget.enterprise.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[#E85002] hover:underline"
                  >
                    <span>{isEn ? 'Company website' : 'Site entreprise'}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="min-h-[42px] rounded-full border border-[var(--ae-border)] px-4 text-xs font-semibold text-[#646464] dark:text-[#A7A7A7] hover:border-[#E85002]"
              >
                {isEn ? 'Close' : 'Fermer'}
              </button>
              {getConnectionWith(detailTarget.member.id)?.status === 'accepted' ? (
                <button
                  type="button"
                  onClick={() => {
                    const id = detailTarget.member.id;
                    setDetailTarget(null);
                    onOpenChat(id);
                  }}
                  className="min-h-[42px] rounded-full orange-glow-btn px-5 text-xs font-semibold"
                >
                  {isEn ? 'Open E2EE chat' : 'Ouvrir la messagerie E2EE'}
                </button>
              ) : getConnectionWith(detailTarget.member.id)?.status !== 'pending' ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailTarget;
                    setDetailTarget(null);
                    setContactTarget(target);
                  }}
                  className="min-h-[42px] rounded-full orange-glow-btn px-5 text-xs font-semibold"
                >
                  {isEn ? 'Send request' : 'Envoyer une demande'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <BadgeScannerModal
        isOpen={badgeModalOpen}
        mode={badgeModalMode}
        isAuthenticated={Boolean(user)}
        lang={lang}
        onClose={() => setBadgeModalOpen(false)}
        onSaveBadgeContact={async (badge) => {
          await onSaveBadgeContact?.(badge);
          setMultimodalStatus(
            isEn
              ? `${badge.fullName}'s badge saved via OCR.`
              : `Badge de ${badge.fullName} enregistré via OCR.`
          );
        }}
        onApplyToProfile={(fields: ParsedBadgeFields) => {
          if (fields.fullName) setFullName(fields.fullName);
          if (fields.headline) setHeadline(fields.headline);
          if (fields.companyName) setEntName(fields.companyName);
          if (fields.sector) setEntSector(fields.sector);
          if (fields.city) setCity(fields.city);
          if (fields.country) setCountry(fields.country);
          setMultimodalStatus(
            isEn
              ? 'Profile pre-filled from OCR badge scan.'
              : 'Profil pré-rempli depuis le scan OCR du badge.'
          );
        }}
      />
    </div>
  );
};
