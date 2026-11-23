import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BellRing,
  Briefcase,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  Globe,
  Heart,
  LayoutGrid,
  Lock,
  Map as MapIcon,
  Mic,
  MicOff,
  Plus,
  ScanLine,
  Search,
  Share2,
  SlidersHorizontal,
  Ticket,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { apiFetch, queueOrSendMutation } from '../lib/apiClient';
import { hasActiveSubscription } from '../lib/accessRules';
import { buildIcsCalendar, buildIcsFilename, getEventAvailabilityStatus } from '../lib/calendarSync';
import {
  CATALOG_CORE_SECTORS,
  buildEventShareData,
  buildSectorFilterOptions,
  filterEvents,
  filterNetworks,
  filterOpportunities,
  type EventDateFilter,
} from '../lib/catalogFilters';
import { getAllCityOptions, getGroupedCountryOptions } from '../lib/worldMap';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type {
  BusinessEvent,
  BusinessOpportunity,
  MemberAccount,
  OpportunityCategory,
  ProfessionalNetwork,
  ScannedBadgeContact,
} from '../types/domain';
import {
  UI_COPY,
  localeForLang,
  translateCountry,
  translateFormat,
  translateOppCategory,
  translateSector,
  type AppLanguage,
} from '../lib/i18n';
import { localizeCity, localizeOpportunity } from '../lib/contentI18n';
import { BadgeScannerModal } from './BadgeScannerModal';
import { EventNetworkHubMap } from './EventNetworkHubMap';
import { EventCalendarBookingSheet } from './EventCalendarBookingSheet';

interface CatalogueViewProps {
  user: MemberAccount | null;
  events: BusinessEvent[];
  networks: ProfessionalNetwork[];
  favoriteEventIds: string[];
  scannedBadges?: ScannedBadgeContact[];
  initialSector?: string;
  initialEventId?: string;
  initialSearchQuery?: string;
  lang?: AppLanguage;
  favoriteReminderEnabled?: boolean;
  notifPermission?: NotificationPermission | 'unsupported';
  onEnableFavoriteReminders?: () => Promise<void> | void;
  onToggleFavoriteReminders?: (enabled: boolean) => Promise<void> | void;
  onTestFavoriteReminder?: () => Promise<boolean> | void;
  onRefresh: () => Promise<void>;
  onToggleFavorite: (eventId: string) => void;
  onSaveBadgeContact?: (badge: ScannedBadgeContact) => Promise<void> | void;
  onGoToSubscription: () => void;
  onOpenAuth: () => void;
}

const getSessionSlots = (isEn: boolean) => [
  {
    id: 'slot-1',
    label: isEn ? 'Plenary' : 'Plénière',
    timeLabel: '09:00',
    detail: isEn ? '09:00 · Hall A' : '09:00 · Salle A',
  },
  { id: 'slot-2', label: 'Deal-Room', timeLabel: '11:30', detail: '11:30 · 1-to-1' },
  {
    id: 'slot-3',
    label: isEn ? 'Export Lab' : 'Atelier Export',
    timeLabel: '14:30',
    detail: isEn ? '14:30 · Table B' : '14:30 · Table B',
  },
  {
    id: 'slot-4',
    label: isEn ? 'VIP Lounge' : 'Salon VIP',
    timeLabel: '18:00',
    detail: '18:00 · Networking',
  },
];

export const CatalogueView: React.FC<CatalogueViewProps> = ({
  user,
  events,
  networks,
  favoriteEventIds,
  scannedBadges = [],
  initialSector = 'all',
  initialEventId,
  initialSearchQuery = '',
  lang = 'fr',
  favoriteReminderEnabled = true,
  notifPermission = 'default',
  onEnableFavoriteReminders,
  onToggleFavoriteReminders,
  onTestFavoriteReminder,
  onRefresh,
  onToggleFavorite,
  onSaveBadgeContact,
  onGoToSubscription,
  onOpenAuth,
}) => {
  const t = UI_COPY[lang];
  const isEn = lang === 'en';
  const sessionSlots = useMemo(() => getSessionSlots(isEn), [isEn]);
  const [badgeScannerEvent, setBadgeScannerEvent] = useState<BusinessEvent | null>(null);
  const [subTab, setSubTab] = useState<'events' | 'networks' | 'favorites' | 'opportunities'>('events');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [countryFilter, setCountryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState(initialSector);
  const [organizerFilter, setOrganizerFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<EventDateFilter>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId || null);
  const [selectedNetwork, setSelectedNetwork] = useState<ProfessionalNetwork | null>(null);
  const [opportunities, setOpportunities] = useState<BusinessOpportunity[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<BusinessOpportunity | null>(null);
  const [oppModalOpen, setOppModalOpen] = useState(false);
  const [oppTitle, setOppTitle] = useState('');
  const [oppCat, setOppCat] = useState<OpportunityCategory>('commercial_partner');
  const [oppSector, setOppSector] = useState('Fintech');
  const [oppCountry, setOppCountry] = useState('Sénégal');
  const [oppBudget, setOppBudget] = useState('');
  const [oppSummary, setOppSummary] = useState('');
  const [oppDetails, setOppDetails] = useState('');
  const [reportEventModalOpen, setReportEventModalOpen] = useState(false);
  const [reportEventReason, setReportEventReason] = useState('');

  const [selectedSlot, setSelectedSlot] = useState<string>('slot-2');
  const [viewMode, setViewMode] = useState<'hub' | 'grid'>('hub');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [calendarConfirmId, setCalendarConfirmId] = useState<string | null>(null);
  const [shareConfirmId, setShareConfirmId] = useState<string | null>(null);

  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const calendarTimerRef = useRef<number | null>(null);
  const shareTimerRef = useRef<number | null>(null);
  const voiceRec = useVoiceRecorder();
  const isSubscriber = hasActiveSubscription(user);

  useEffect(() => {
    return () => {
      try {
        speechRecRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
      if (calendarTimerRef.current !== null) window.clearTimeout(calendarTimerRef.current);
      if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialSector) setSectorFilter(initialSector);
  }, [initialSector]);

  useEffect(() => {
    if (initialEventId) setSelectedEventId(initialEventId);
  }, [initialEventId]);

  useEffect(() => {
    if (initialSearchQuery !== undefined) setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    apiFetch<{ opportunities: BusinessOpportunity[] }>('/api/opportunities')
      .then((res) => setOpportunities(res.opportunities))
      .catch(() => {});
  }, [user?.id, user?.subscriptionStatus]);

  const localizedOpportunities = useMemo(
    () => opportunities.map((opp) => localizeOpportunity(opp, lang)),
    [opportunities, lang]
  );

  const groupedCountries = useMemo(() => getGroupedCountryOptions(), []);
  const cities = useMemo(() => getAllCityOptions(events.map((e) => e.city)), [events]);
  const sectors = useMemo(
    () => Array.from(new Set([...CATALOG_CORE_SECTORS, ...events.map((e) => e.sector)])),
    [events]
  );
  const sectorFilterOptions = useMemo(
    () =>
      buildSectorFilterOptions(events, networks, localizedOpportunities, subTab, favoriteEventIds),
    [events, networks, localizedOpportunities, subTab, favoriteEventIds]
  );
  const organizers = useMemo(
    () => Array.from(new Set(events.map((e) => e.organizerName).filter(Boolean))).sort(),
    [events]
  );

  const filteredEvents = useMemo(
    () =>
      filterEvents(events, {
        searchQuery,
        country: countryFilter,
        city: cityFilter,
        sector: sectorFilter,
        organizer: organizerFilter,
        format: formatFilter,
        dateFilter,
        customStartDate,
        customEndDate,
      }),
    [
      events,
      countryFilter,
      cityFilter,
      sectorFilter,
      organizerFilter,
      formatFilter,
      dateFilter,
      customStartDate,
      customEndDate,
      searchQuery,
    ]
  );

  const favoriteEvents = useMemo(
    () =>
      filterEvents(
        events.filter((ev) => favoriteEventIds.includes(ev.id)),
        {
          searchQuery,
          country: countryFilter,
          city: cityFilter,
          sector: sectorFilter,
          organizer: organizerFilter,
          format: formatFilter,
          dateFilter,
          customStartDate,
          customEndDate,
        }
      ),
    [
      events,
      favoriteEventIds,
      countryFilter,
      cityFilter,
      sectorFilter,
      organizerFilter,
      formatFilter,
      dateFilter,
      customStartDate,
      customEndDate,
      searchQuery,
    ]
  );

  const hasActiveSearchOrFilters =
    Boolean(searchQuery.trim()) ||
    countryFilter !== 'all' ||
    cityFilter !== 'all' ||
    sectorFilter !== 'all' ||
    organizerFilter !== 'all' ||
    formatFilter !== 'all' ||
    dateFilter !== 'all' ||
    Boolean(customStartDate) ||
    Boolean(customEndDate);

  const resetAllFilters = () => {
    setSearchQuery('');
    setCountryFilter('all');
    setCityFilter('all');
    setSectorFilter('all');
    setOrganizerFilter('all');
    setFormatFilter('all');
    setDateFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const allSavedFavoriteCount = useMemo(
    () => events.filter((ev) => favoriteEventIds.includes(ev.id)).length,
    [events, favoriteEventIds]
  );

  const filteredNetworks = useMemo(
    () =>
      filterNetworks(networks, {
        searchQuery,
        country: countryFilter,
        sector: sectorFilter,
      }),
    [networks, countryFilter, sectorFilter, searchQuery]
  );

  const filteredOpportunities = useMemo(
    () =>
      filterOpportunities(localizedOpportunities, {
        searchQuery,
        country: countryFilter,
        sector: sectorFilter,
      }),
    [localizedOpportunities, countryFilter, sectorFilter, searchQuery]
  );

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const handleVoiceSearch = async () => {
    setFeedback(null);
    setVoiceStatus(null);

    if (voiceListening && speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // Ignore
      }
      speechRecRef.current = null;
      setVoiceListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const rec = new SpeechRec() as {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: (ev: { results: ArrayLike<{ isFinal?: boolean } & ArrayLike<{ transcript: string }>> }) => void;
          onerror: (ev: { error?: string }) => void;
          onend: () => void;
          start: () => void;
          stop: () => void;
        };
        rec.lang = lang === 'en' ? 'en-US' : 'fr-FR';
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        speechRecRef.current = rec;
        setVoiceListening(true);
        setVoiceStatus(
          lang === 'en'
            ? 'Listening via Web Speech... Say a city, sector, or event.'
            : 'Écoute vocale active... Prononcez une ville, un secteur ou un mot-clé.'
        );
        rec.onresult = (ev) => {
          const first = ev.results?.[0];
          const text = first?.[0]?.transcript?.trim() || '';
          if (text) {
            setSearchQuery(text);
            if (first?.isFinal) {
              setVoiceStatus(isEn ? `Voice search applied: "${text}"` : `Recherche vocale appliquée : « ${text} »`);
            }
          }
          if (first?.isFinal) {
            setVoiceListening(false);
            speechRecRef.current = null;
          }
        };
        rec.onerror = (ev) => {
          setVoiceListening(false);
          speechRecRef.current = null;
          if (ev?.error === 'not-allowed') {
            setVoiceStatus(isEn ? 'Microphone permission denied.' : 'Autorisation microphone refusée par le navigateur.');
          } else if (ev?.error === 'no-speech') {
            setVoiceStatus(isEn ? 'No speech detected. Try again.' : 'Aucune parole détectée. Réessayez.');
          } else {
            setVoiceStatus(isEn ? 'Voice recognition interrupted.' : 'Reconnaissance vocale interrompue.');
          }
        };
        rec.onend = () => {
          setVoiceListening(false);
          speechRecRef.current = null;
        };
        rec.start();
        return;
      } catch {
        setVoiceListening(false);
        speechRecRef.current = null;
      }
    }

    if (voiceRec.isRecording) {
      const res = await voiceRec.stopRecording();
      if (res && user) {
        try {
          const tr = await apiFetch<{ transcript: string }>('/api/multimodal/transcribe', {
            method: 'POST',
            body: JSON.stringify({ audioBase64: res.dataUrl, mimeType: res.mimeType }),
          });
          if (tr.transcript) {
            setSearchQuery(tr.transcript);
            setVoiceStatus(
              isEn ? `Voice search applied: "${tr.transcript}"` : `Recherche vocale appliquée : « ${tr.transcript} »`
            );
          }
        } catch (err) {
          setFeedback({
            type: 'err',
            text:
              err instanceof Error
                ? err.message
                : isEn
                  ? 'Voice transcription unavailable.'
                  : 'Transcription vocale indisponible.',
          });
        }
      }
    } else {
      try {
        await voiceRec.startRecording();
      } catch {
        setVoiceStatus(
          isEn
            ? 'Web Speech API unsupported on this browser.'
            : 'API Web Speech non prise en charge sur ce navigateur.'
        );
      }
    }
  };

  const handleSpeakSummary = async (id: string, text: string) => {
    if (speakingId === id) {
      window.speechSynthesis?.cancel();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(id);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = isEn ? 'en-US' : 'fr-FR';
      utter.onend = () => setSpeakingId(null);
      utter.onerror = () => setSpeakingId(null);
      window.speechSynthesis.speak(utter);
    }
  };

  const handleRegisterToggle = async (ev: BusinessEvent) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!isSubscriber) {
      onGoToSubscription();
      return;
    }
    setActionBusy(true);
    setFeedback(null);
    try {
      const method = ev.isRegistered ? 'DELETE' : 'POST';
      const slotLabel = sessionSlots.find((s) => s.id === selectedSlot)?.label || sessionSlots[0].label;
      const { queued } = await queueOrSendMutation({
        clientMutationId: `reg-${ev.id}-${Date.now()}`,
        endpoint: `/api/events/${ev.id}/register`,
        method,
        body: ev.isRegistered ? undefined : { sessionSlot: slotLabel },
        label: ev.isRegistered
          ? isEn
            ? `Cancel ${ev.title}`
            : `Annulation ${ev.title}`
          : isEn
            ? `Register ${ev.title}`
            : `Inscription ${ev.title}`,
      });
      if (queued) {
        setFeedback({
          type: 'ok',
          text: isEn
            ? 'Offline: your action is saved in the encrypted queue and will sync once online.'
            : 'Hors ligne : votre action est enregistrée dans la file chiffrée et sera synchronisée dès le retour du réseau.',
        });
      } else {
        await onRefresh();
        setFeedback({
          type: 'ok',
          text: ev.isRegistered
            ? isEn
              ? 'Registration cancelled.'
              : 'Inscription annulée.'
            : isEn
              ? `Registration confirmed (${slotLabel})! Seat reserved.`
              : `Inscription confirmée (${slotLabel}) ! Place réservée.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : isEn ? 'Action failed.' : 'Action impossible.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handlePublishOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oppTitle.trim() || !oppSummary.trim()) return;
    setActionBusy(true);
    try {
      const res = await apiFetch<{ opportunity: BusinessOpportunity }>('/api/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          title: oppTitle,
          category: oppCat,
          sector: oppSector,
          country: oppCountry,
          budgetRange: oppBudget || (isEn ? 'To be discussed' : 'À convenir'),
          publicSummary: oppSummary,
          fullDetails: oppDetails || oppSummary,
        }),
      });
      setOpportunities((prev) => [res.opportunity, ...prev]);
      setOppModalOpen(false);
      setOppTitle('');
      setOppSummary('');
      setOppDetails('');
      setOppBudget('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : isEn ? 'Unable to publish.' : 'Publication impossible.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleReportEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent || !reportEventReason.trim()) return;
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'event',
          targetId: selectedEvent.id,
          reason: reportEventReason,
        }),
      });
      setReportEventModalOpen(false);
      setReportEventReason('');
      setFeedback({
        type: 'ok',
        text: isEn ? 'Event report submitted to moderation.' : 'Signalement événement transmis à la modération.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : isEn ? 'Report failed.' : 'Signalement impossible.',
      });
    }
  };

  const formatLabel = (f: BusinessEvent['format']) => translateFormat(f, lang);

  const triggerCalendarMicroInteraction = (eventId: string) => {
    setCalendarConfirmId(null);
    window.requestAnimationFrame(() => {
      setCalendarConfirmId(eventId);
    });
    if (calendarTimerRef.current !== null) {
      window.clearTimeout(calendarTimerRef.current);
    }
    calendarTimerRef.current = window.setTimeout(() => {
      setCalendarConfirmId((prev) => (prev === eventId ? null : prev));
    }, 950);
  };

  const triggerShareMicroInteraction = (eventId: string) => {
    setShareConfirmId(null);
    window.requestAnimationFrame(() => {
      setShareConfirmId(eventId);
    });
    if (shareTimerRef.current !== null) {
      window.clearTimeout(shareTimerRef.current);
    }
    shareTimerRef.current = window.setTimeout(() => {
      setShareConfirmId((prev) => (prev === eventId ? null : prev));
    }, 950);
  };

  const handleAddEventToCalendar = async (ev: BusinessEvent) => {
    triggerCalendarMicroInteraction(ev.id);
    try {
      const ics = buildIcsCalendar([{ event: ev }], {
        calendarName: `Africa Entrepreneur — ${ev.title}`,
      });
      const fileName = buildIcsFilename(ev.title);
      const icsFile = new File([ics], fileName, { type: 'text/calendar;charset=utf-8' });
      const navWithShare = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };

      let sharedNatively = false;
      if (typeof navWithShare.share === 'function' && navWithShare.canShare?.({ files: [icsFile] })) {
        try {
          await navWithShare.share({
            title: ev.title,
            text: `Importer « ${ev.title} » dans votre calendrier`,
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
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      setFeedback({
        type: 'ok',
        text:
          lang === 'en'
            ? `Event "${ev.title}" exported to your calendar (.ics).`
            : `Événement « ${ev.title} » exporté pour votre calendrier (.ics).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de générer le fichier calendrier (.ics).',
      });
    }
  };

  const handleShareEvent = async (ev: BusinessEvent) => {
    triggerShareMicroInteraction(ev.id);
    const shareData = buildEventShareData(ev, window.location.origin, lang);

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        setFeedback({
          type: 'ok',
          text:
            lang === 'en'
              ? `Event "${ev.title}" shared.`
              : `Événement « ${ev.title} » partagé.`,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // Fall through to clipboard fallback when Web Share is blocked or unsupported
      }
    }

    try {
      const shareText = `${shareData.title}\n${shareData.text}\n${shareData.url}`;
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareText);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied && typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = shareText;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      }
      if (!copied) {
        throw new Error('Clipboard copy unavailable');
      }
      setFeedback({
        type: 'ok',
        text:
          lang === 'en'
            ? `Share link for "${ev.title}" copied to clipboard.`
            : `Lien et détails de « ${ev.title} » copiés pour partage.`,
      });
    } catch {
      setFeedback({
        type: 'err',
        text:
          lang === 'en'
            ? 'Unable to share this event right now.'
            : 'Impossible de partager cet événement pour le moment.',
      });
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Editorial Discovery Header + Top Sector Filter Bar + Search Capsule + Map/Grid Switch */}
      <section className="porcelain-card rounded-[28px] p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--ae-border)] pb-2.5 text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
          <span className="uppercase tracking-wider text-[#E85002] font-bold">
            {isEn ? 'Global Network Explorer' : 'Explorer Network'}
          </span>
          <span className="font-mono tabular-nums">
            {filteredEvents.length} {isEn ? 'events' : 'événements'} · {filteredNetworks.length}{' '}
            {isEn ? 'networks' : 'réseaux'}
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#000000] dark:text-[#F9F9F9] leading-tight">
                {isEn ? 'Events & Business Networks' : 'Événements & Réseautages'}
              </h1>
              <ArrowUpRight className="h-5 w-5 text-[#E85002] shrink-0" aria-hidden="true" />
            </div>
            <p className="mt-1 text-xs sm:text-sm text-[#646464] dark:text-[#A7A7A7]">
              {isSubscriber
                ? isEn
                  ? 'Full access enabled · Global hub map, interactive booking & registrations'
                  : 'Accès complet activé · Pôles géographiques, calendrier interactif et inscriptions'
                : isEn
                  ? 'Personal preview · Explore the world hub map, filter sectors & save favorites'
                  : 'Mode aperçu Personnel · Explorez la carte des pôles, filtrez et enregistrez vos favoris'}
            </p>
          </div>

          {(subTab === 'events' || subTab === 'networks') && (
            <div
              className="ios-segmented inline-flex self-start shrink-0"
              role="group"
              aria-label={isEn ? 'Display mode' : 'Mode d’affichage'}
            >
              <button
                type="button"
                onClick={() => setViewMode('hub')}
                aria-pressed={viewMode === 'hub'}
                className={`min-h-[34px] inline-flex items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  viewMode === 'hub'
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-xs'
                    : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                <span>{isEn ? 'World Map' : 'Carte Monde'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                className={`min-h-[34px] inline-flex items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  viewMode === 'grid'
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-xs'
                    : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>{isEn ? 'Grid' : 'Grille'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Top Horizontal Business Sector Filter Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#646464] dark:text-[#A7A7A7]">
            <span className="uppercase tracking-wider">
              {isEn ? 'Filter by business sector' : 'Parcourir par secteur d’activité'}
            </span>
            {sectorFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSectorFilter('all')}
                className="text-[#E85002] hover:underline"
              >
                {isEn ? 'Show all sectors' : 'Tous les secteurs'}
              </button>
            )}
          </div>
          <div
            role="tablist"
            aria-label={isEn ? 'Business sector filters' : 'Filtres par secteur d’activité'}
            className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sectorFilter === 'all'}
              onClick={() => setSectorFilter('all')}
              className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all whitespace-nowrap shrink-0 border ${
                sectorFilter === 'all'
                  ? 'bg-[#E85002] text-[#F9F9F9] border-[#E85002] shadow-[0_6px_16px_-6px_rgba(232,80,2,0.65)]'
                  : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] border-[var(--ae-border)] hover:border-[#E85002]'
              }`}
            >
              <span>{isEn ? 'All sectors' : 'Tous'}</span>
            </button>
            {sectorFilterOptions.map((opt) => {
              const active = sectorFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSectorFilter(active ? 'all' : opt.id)}
                  className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-[#E85002] text-[#F9F9F9] border-[#E85002] shadow-[0_6px_16px_-6px_rgba(232,80,2,0.65)]'
                      : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] border-[var(--ae-border)] hover:border-[#E85002]'
                  }`}
                >
                  <span>{translateSector(opt.id, lang)}</span>
                  <span
                    className={`font-mono text-[10px] tabular-nums rounded-full px-1.5 py-0.5 ${
                      active
                        ? 'bg-black/25 text-[#F9F9F9]'
                        : 'bg-white/80 dark:bg-[#26262B] text-[#646464] dark:text-[#A7A7A7]'
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar + Voice Search + Filters Toggle */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 flex items-center">
            <Search className="pointer-events-none absolute left-4 h-4 w-4 text-[#E85002]" />
            <label htmlFor="catalog-search" className="sr-only">
              {t.searchPlaceholder}
            </label>
            <input
              id="catalog-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className={`w-full min-h-[48px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-11 ${
                searchQuery ? 'pr-20' : 'pr-12'
              } text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#646464] dark:placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#1E1E22] focus:outline-none [&::-webkit-search-cancel-button]:hidden`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={isEn ? 'Clear search' : 'Effacer la recherche'}
                className="absolute right-11 min-h-[34px] min-w-[34px] flex items-center justify-center rounded-full text-[#646464] hover:bg-black/5 hover:text-[#E85002] dark:text-[#A7A7A7]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleVoiceSearch}
              aria-pressed={voiceListening || voiceRec.isRecording}
              aria-label={isEn ? 'Voice search' : 'Recherche vocale'}
              title={isEn ? 'Dictate voice search (Web Speech)' : 'Dicter une recherche vocale (Web Speech)'}
              className={`absolute right-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full transition-colors ${
                voiceListening || voiceRec.isRecording
                  ? 'bg-[#C10801] text-[#F9F9F9] animate-pulse'
                  : 'text-[#646464] dark:text-[#A7A7A7] hover:bg-[#E85002]/15 hover:text-[#E85002]'
              }`}
            >
              {voiceListening || voiceRec.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFiltersPanel((v) => !v)}
            aria-expanded={showFiltersPanel}
            aria-label={lang === 'en' ? 'Show country, sector, and host filters' : 'Afficher les filtres pays, secteur et hôte'}
            className={`min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full border transition-colors shrink-0 ${
              showFiltersPanel || organizerFilter !== 'all' || countryFilter !== 'all' || cityFilter !== 'all' || sectorFilter !== 'all' || dateFilter !== 'all'
                ? 'border-[#E85002] bg-[#E85002] text-[#F9F9F9]'
                : 'border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {hasActiveSearchOrFilters && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#646464] dark:text-[#A7A7A7]"
          >
            <span>
              <strong className="font-mono text-[#000000] dark:text-[#F9F9F9]">
                {subTab === 'networks'
                  ? filteredNetworks.length
                  : subTab === 'favorites'
                    ? favoriteEvents.length
                    : subTab === 'opportunities'
                      ? filteredOpportunities.length
                      : filteredEvents.length}
              </strong>{' '}
              {lang === 'en' ? 'matching result(s)' : 'résultat(s) correspondant(s)'}
              {searchQuery.trim() ? ` · « ${searchQuery.trim()} »` : ''}
            </span>
            <button
              type="button"
              onClick={resetAllFilters}
              className="font-semibold text-[#E85002] hover:text-[#F16001] underline underline-offset-2"
            >
              {lang === 'en' ? 'Reset filters' : 'Réinitialiser'}
            </button>
          </div>
        )}

        {(voiceListening || voiceRec.isRecording || voiceStatus) && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-2 rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-4 py-2 text-xs text-[#000000] dark:text-[#F9F9F9]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Mic className={`h-3.5 w-3.5 shrink-0 ${voiceListening ? 'text-[#C10801] animate-pulse' : 'text-[#E85002]'}`} />
              <span className="truncate">{voiceStatus || (lang === 'en' ? 'Voice recording in progress...' : 'Enregistrement vocal en cours...')}</span>
            </div>
            {voiceStatus && !voiceListening && (
              <button
                type="button"
                onClick={() => setVoiceStatus(null)}
                aria-label={lang === 'en' ? 'Dismiss voice message' : 'Fermer le message vocal'}
                className="text-[#646464] hover:text-[#E85002] dark:text-[#A7A7A7] shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Segmented Sub-tabs + Format Chips */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="ios-segmented grid grid-cols-2 sm:inline-flex gap-1 self-stretch sm:self-start">
            <button
              type="button"
              onClick={() => setSubTab('events')}
              className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === 'events'
                  ? 'bg-[#E85002] text-[#F9F9F9]'
                  : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
              }`}
            >
              {t.eventsTab} ({filteredEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('networks')}
              className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === 'networks'
                  ? 'bg-[#E85002] text-[#F9F9F9]'
                  : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
              }`}
            >
              {t.networksTab} ({filteredNetworks.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('favorites')}
              className={`min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === 'favorites'
                  ? 'bg-[#E85002] text-[#F9F9F9]'
                  : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
              }`}
            >
              <Heart
                className={`h-3.5 w-3.5 ${
                  allSavedFavoriteCount > 0 ? 'fill-current' : ''
                }`}
              />
              <span>
                {t.favoritesTab} ({allSavedFavoriteCount})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('opportunities')}
              className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === 'opportunities'
                  ? 'bg-[#E85002] text-[#F9F9F9]'
                  : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
              }`}
            >
              {t.opportunitiesTab} ({filteredOpportunities.length})
            </button>
          </div>

          {(subTab === 'events' || subTab === 'favorites') && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: isEn ? 'All formats' : 'Tous formats' },
                { id: 'in_person', label: isEn ? 'In-Person' : 'Présentiel' },
                { id: 'hybrid', label: isEn ? 'Hybrid' : 'Hybride' },
                { id: 'virtual', label: isEn ? 'Online' : 'En ligne' },
              ].map((fmt) => {
                const active = formatFilter === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setFormatFilter(fmt.id)}
                    className={`min-h-[34px] rounded-full px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#E85002] text-[#F9F9F9]'
                        : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#333333] dark:text-[#A7A7A7] hover:border hover:border-[#E85002]'
                    }`}
                  >
                    {fmt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Date Filter Bar */}
        {(subTab === 'events' || subTab === 'favorites') && (
          <div className="space-y-2.5 pt-1 border-t border-[var(--ae-border)]">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={isEn ? 'Filter by date' : 'Filtrer par date'}>
              <span className="inline-flex items-center gap-1.5 pr-1 text-[11px] font-semibold text-[#646464] dark:text-[#A7A7A7]">
                <Calendar className="h-3.5 w-3.5 text-[#E85002]" aria-hidden="true" />
                <span>{isEn ? 'Date:' : 'Période :'}</span>
              </span>
              {(
                [
                  { id: 'all', label: isEn ? 'All dates' : 'Toutes dates' },
                  { id: '7d', label: isEn ? 'Next 7 days' : 'Prochains 7 jours' },
                  { id: 'this_month', label: isEn ? 'This month' : 'Ce mois' },
                  { id: '30d', label: isEn ? 'Next 30 days' : '30 prochains jours' },
                  { id: 'custom', label: isEn ? 'Custom dates' : 'Dates personnalisées' },
                ] as const
              ).map((opt) => {
                const active = dateFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDateFilter(opt.id)}
                    aria-pressed={active}
                    className={`min-h-[32px] rounded-full px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#E85002] text-[#F9F9F9] shadow-xs'
                        : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#333333] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {dateFilter === 'custom' && (
              <div className="flex flex-wrap items-end gap-2.5 rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] p-3">
                <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:flex-initial">
                  <label
                    htmlFor="catalog-date-start"
                    className="text-[11px] font-semibold text-[#333333] dark:text-[#A7A7A7]"
                  >
                    {isEn ? 'From' : 'Date de début'}
                  </label>
                  <input
                    id="catalog-date-start"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="min-h-[38px] rounded-xl bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:flex-initial">
                  <label
                    htmlFor="catalog-date-end"
                    className="text-[11px] font-semibold text-[#333333] dark:text-[#A7A7A7]"
                  >
                    {isEn ? 'To' : 'Date de fin'}
                  </label>
                  <input
                    id="catalog-date-end"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="min-h-[38px] rounded-xl bg-white dark:bg-[#121214] border border-[var(--ae-border)] px-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                  />
                </div>
                {(customStartDate || customEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="min-h-[38px] rounded-xl px-3 text-xs font-semibold text-[#E85002] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    {isEn ? 'Clear dates' : 'Effacer les dates'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {showFiltersPanel && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            <select
              aria-label={isEn ? 'Filter by country (Africa & Diaspora)' : 'Filtrer par pays (Afrique & Diaspora)'}
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="min-h-[42px] rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
            >
              <option value="all">{isEn ? 'All countries (88)' : 'Tous pays (88)'}</option>
              <optgroup label={isEn ? 'Africa (54 countries)' : 'Afrique (54 pays)'}>
                {groupedCountries.africa.map((c) => (
                  <option key={c.isoNumeric} value={c.nameFr}>
                    {isEn ? c.nameEn : c.nameFr}
                  </option>
                ))}
              </optgroup>
              <optgroup label={isEn ? 'Global Diaspora (34 countries)' : 'Diaspora Monde (34 pays)'}>
                {groupedCountries.diaspora.map((c) => (
                  <option key={c.isoNumeric} value={c.nameFr}>
                    {isEn ? c.nameEn : c.nameFr}
                  </option>
                ))}
              </optgroup>
            </select>

            <select
              aria-label={isEn ? 'Filter by city' : 'Filtrer par ville'}
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="min-h-[42px] rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
            >
              <option value="all">{isEn ? 'All cities' : 'Toutes villes'}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {localizeCity(c, lang)}
                </option>
              ))}
            </select>

            <select
              aria-label={isEn ? 'Filter by sector' : 'Filtrer par secteur'}
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="min-h-[42px] rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
            >
              <option value="all">{isEn ? 'All sectors' : 'Tous secteurs'}</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {translateSector(s, lang)}
                </option>
              ))}
            </select>

            <select
              aria-label={isEn ? 'Filter by host or organizer' : 'Filtrer par hôte ou organisateur'}
              value={organizerFilter}
              onChange={(e) => setOrganizerFilter(e.target.value)}
              className="min-h-[42px] rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
            >
              <option value="all">{isEn ? 'All hosts' : 'Tous hôtes'}</option>
              {organizers.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>

            <select
              aria-label={isEn ? 'Filter by timeframe' : 'Filtrer par période'}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as EventDateFilter)}
              className="min-h-[42px] rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
            >
              <option value="all">{isEn ? 'All dates' : 'Toutes dates'}</option>
              <option value="7d">{isEn ? 'Next 7 days' : 'Prochains 7 jours'}</option>
              <option value="this_month">{isEn ? 'This month' : 'Ce mois'}</option>
              <option value="30d">{isEn ? 'Next 30 days' : '30 prochains jours'}</option>
              <option value="custom">{isEn ? 'Custom dates' : 'Dates personnalisées'}</option>
              <option value="2026">{isEn ? 'Year 2026' : 'Année 2026'}</option>
              <option value="2027">{isEn ? 'Year 2027' : 'Année 2027'}</option>
            </select>
          </div>
        )}
      </section>

      {/* Interactive Geo World Map for Events & Networks */}
      {viewMode === 'hub' && (subTab === 'events' || subTab === 'networks') && (
        <EventNetworkHubMap
          mode={subTab}
          events={filteredEvents}
          networks={filteredNetworks}
          favoriteEventIds={favoriteEventIds}
          lang={lang}
          selectedCountryFilter={countryFilter}
          onFilterLocation={(country) =>
            setCountryFilter((prev) => (prev === country ? 'all' : country))
          }
          onSelectEvent={(id) => {
            setSelectedEventId(id);
            setFeedback(null);
          }}
          onSelectNetwork={(net) => setSelectedNetwork(net)}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      {/* Dedicated Favorites 30-Min Local Push Reminder Banner */}
      {subTab === 'favorites' && (
        <div className="porcelain-card rounded-3xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E85002] text-[#F9F9F9]">
              {favoriteReminderEnabled && notifPermission === 'granted' ? (
                <BellRing className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                {t.reminder30mTitle}
              </p>
              <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7]">
                {notifPermission === 'denied'
                  ? t.reminderPermissionDenied
                  : favoriteReminderEnabled && notifPermission === 'granted'
                    ? t.reminderActiveLabel
                    : t.reminder30mDesc}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {notifPermission !== 'granted' && notifPermission !== 'unsupported' && notifPermission !== 'denied' ? (
              <button
                type="button"
                onClick={() => onEnableFavoriteReminders?.()}
                className="min-h-[38px] rounded-full orange-glow-btn px-4 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                {t.reminderEnableBtn}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleFavoriteReminders?.(!favoriteReminderEnabled)}
                aria-pressed={favoriteReminderEnabled}
                className={`min-h-[38px] rounded-full px-4 text-xs font-semibold transition-colors whitespace-nowrap ${
                  favoriteReminderEnabled
                    ? 'bg-[#E85002] text-[#F9F9F9]'
                    : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#333333] dark:text-[#A7A7A7]'
                }`}
              >
                {favoriteReminderEnabled
                  ? isEn
                    ? 'Reminders active'
                    : 'Rappels activés'
                  : isEn
                    ? 'Enable reminders'
                    : 'Activer rappels'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onTestFavoriteReminder?.()}
              className="min-h-[38px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors whitespace-nowrap"
            >
              {t.reminderTestBtn}
            </button>
          </div>
        </div>
      )}

      {/* Inline Calendar Export / Catalog Feedback Banner */}
      {feedback && !selectedEvent && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-2xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 border ${
            feedback.type === 'ok'
              ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/50'
              : 'bg-rose-50/90 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/50'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label={isEn ? 'Dismiss notice' : 'Fermer la notification'}
            className="shrink-0 rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Events Asymmetric Bento Grid OR Dedicated Favorites Tab */}
      {(subTab === 'events' || subTab === 'favorites') && (() => {
        const displayEvents = subTab === 'favorites' ? favoriteEvents : filteredEvents;
        return (
          <div className="grid gap-5 md:grid-cols-2">
            {displayEvents.length === 0 ? (
              <div className="md:col-span-2 porcelain-card rounded-3xl p-10 text-center">
                {subTab === 'favorites' && allSavedFavoriteCount === 0 ? (
                  <>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E85002]/15 text-[#E85002]">
                      <Heart className="h-6 w-6" />
                    </div>
                    <p className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {isEn ? 'No saved favorites yet' : 'Aucun événement en favoris'}
                    </p>
                    <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">{t.noFavoritesText}</p>
                    <button
                      type="button"
                      onClick={() => setSubTab('events')}
                      className="mt-4 min-h-[44px] rounded-full orange-glow-btn px-6 text-xs font-semibold"
                    >
                      {isEn ? 'Browse events' : 'Parcourir les événements'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {subTab === 'favorites'
                        ? isEn
                          ? 'No favorite matches your filters'
                          : 'Aucun favori ne correspond à votre recherche'
                        : isEn
                          ? 'No event matches your filters'
                          : 'Aucun événement ne correspond à vos filtres'}
                    </p>
                    <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
                      {isEn
                        ? 'Reset active filters to browse the full Africa & Diaspora calendar.'
                        : 'Réinitialisez les critères pour explorer tout le catalogue.'}
                    </p>
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="mt-4 min-h-[44px] rounded-full orange-glow-btn px-6 text-xs font-semibold"
                    >
                      {isEn ? 'Reset filters' : 'Réinitialiser les filtres'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              displayEvents.map((ev, index) => {
                const isFav = favoriteEventIds.includes(ev.id);
                const availability = getEventAvailabilityStatus(ev);
                const availabilityLabel = isEn ? availability.labelEn : availability.labelFr;
                const availabilityPillClass =
                  availability.status === 'full'
                    ? 'border-[#C10801]/40 bg-[#C10801]/10 text-[#C10801] dark:border-[#C10801]/50 dark:bg-[#C10801]/20 dark:text-[#F9F9F9]'
                    : availability.status === 'limited'
                      ? 'border-[#F16001]/45 bg-[#F16001]/15 text-[#E85002] dark:border-[#F16001]/45 dark:bg-[#F16001]/20 dark:text-[#D9C3AB]'
                      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-300';
                const availabilityDotClass =
                  availability.status === 'full'
                    ? 'bg-[#C10801]'
                    : availability.status === 'limited'
                      ? 'bg-[#F16001]'
                      : 'bg-emerald-500';
                return (
                  <article
                    key={ev.id}
                    className={`group porcelain-card overflow-hidden rounded-3xl flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E85002]/60 ${
                      index === 0 ? 'md:col-span-2' : ''
                    }`}
                  >
                    <div className={`relative w-full overflow-hidden bg-[#121214] ${index === 0 ? 'h-64' : 'h-48'}`}>
                      {ev.imageUrl ? (
                        <img
                          src={ev.imageUrl}
                          alt={ev.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="h-full w-full brand-gradient-card" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                      <div className="absolute top-3.5 right-3.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(ev.id)}
                          aria-pressed={isFav}
                          aria-label={
                            isFav
                              ? isEn
                                ? `Remove ${ev.title} from favorites`
                                : `Retirer ${ev.title} des favoris`
                              : isEn
                                ? `Add ${ev.title} to favorites`
                                : `Ajouter ${ev.title} aux favoris`
                          }
                          title={isFav ? t.favoritedBtn : t.favoriteBtn}
                          className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-full px-3 text-xs font-semibold backdrop-blur-md transition-colors ${
                            isFav
                              ? 'bg-[#E85002] text-[#F9F9F9] shadow-sm hover:bg-[#F16001]'
                              : 'bg-black/60 text-[#F9F9F9] hover:bg-[#E85002]'
                          }`}
                        >
                          <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-white text-white' : ''}`} />
                          <span>{t.favoriteBtn}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSpeakSummary(ev.id, `${ev.title}. ${ev.publicSummary}`)}
                          aria-label={isEn ? `Listen to summary of ${ev.title}` : `Écouter le résumé de ${ev.title}`}
                          className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                            speakingId === ev.id
                              ? 'bg-[#E85002] text-[#F9F9F9]'
                              : 'bg-black/60 text-[#F9F9F9] hover:bg-[#E85002]'
                          }`}
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="absolute bottom-3.5 left-4 right-4 flex items-center justify-between text-xs text-[#F9F9F9]">
                        <span className="font-medium">
                          {translateSector(ev.sector, lang)} · {formatLabel(ev.format)}
                        </span>
                        {ev.isRegistered ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{isEn ? 'Registered' : 'Inscrit'}</span>
                          </span>
                        ) : ev.locked ? (
                          <span className="inline-flex items-center gap-1 font-medium text-[#D9C3AB]">
                            <Lock className="h-3.5 w-3.5" />
                            <span>{isEn ? 'Preview' : 'Aperçu'}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="p-5 flex flex-1 flex-col justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-[#E85002] truncate">
                            {ev.organizerName}
                          </p>
                          <span
                            aria-label={`${isEn ? 'Availability' : 'Disponibilité'} : ${availabilityLabel}`}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 ${availabilityPillClass}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-full shrink-0 ${availabilityDotClass}`}
                            />
                            <span>{availabilityLabel}</span>
                          </span>
                        </div>
                        <h2 className="mt-1 text-lg sm:text-xl font-bold text-[#000000] dark:text-[#F9F9F9] leading-snug">
                          {ev.title}
                        </h2>
                        <p className="mt-1 text-xs text-[#646464] dark:text-[#A7A7A7]">
                          {ev.city}, {translateCountry(ev.country, lang)}
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">
                            {new Date(ev.dateIso).toLocaleDateString(localeForLang(lang), {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">
                            {ev.registeredCount}/{ev.capacity} {isEn ? 'seats' : 'inscrits'}
                          </span>
                        </p>
                        <p className="mt-2.5 text-sm text-[#333333] dark:text-[#A7A7A7] line-clamp-2 leading-relaxed">
                          {ev.publicSummary}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--ae-border)]">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleAddEventToCalendar(ev)}
                            aria-label={`${t.addToCalendarBtn} : ${ev.title}`}
                            data-confirmed={calendarConfirmId === ev.id ? 'true' : 'false'}
                            className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold active:scale-95 transition-all duration-150 whitespace-nowrap ${
                              calendarConfirmId === ev.id
                                ? 'animate-action-confirm border-[#E85002] bg-[#E85002]/15 text-[#E85002] dark:text-[#F9F9F9]'
                                : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] border-[var(--ae-border)] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]'
                            }`}
                          >
                            {calendarConfirmId === ev.id ? (
                              <Check className="h-3.5 w-3.5 text-[#E85002] shrink-0" />
                            ) : (
                              <CalendarPlus className="h-3.5 w-3.5 text-[#E85002] shrink-0" />
                            )}
                            <span>{t.addToCalendarBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShareEvent(ev)}
                            aria-label={`${t.shareBtn} ${ev.title}`}
                            data-confirmed={shareConfirmId === ev.id ? 'true' : 'false'}
                            className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold active:scale-95 transition-all duration-150 whitespace-nowrap ${
                              shareConfirmId === ev.id
                                ? 'animate-action-confirm border-[#E85002] bg-[#E85002]/15 text-[#E85002] dark:text-[#F9F9F9]'
                                : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] border-[var(--ae-border)] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]'
                            }`}
                          >
                            {shareConfirmId === ev.id ? (
                              <Check className="h-3.5 w-3.5 text-[#E85002] shrink-0" />
                            ) : (
                              <Share2 className="h-3.5 w-3.5 text-[#E85002] shrink-0" />
                            )}
                            <span>{t.shareBtn}</span>
                          </button>
                          {(ev.format === 'in_person' || ev.format === 'hybrid') && (
                            <button
                              type="button"
                              onClick={() => setBadgeScannerEvent(ev)}
                              aria-label={isEn ? `Scan a badge for ${ev.title}` : `Scanner un badge pour ${ev.title}`}
                              title={t.scanBadgeBtn}
                              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-full bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors whitespace-nowrap"
                            >
                              <ScanLine className="h-3.5 w-3.5 text-[#E85002] shrink-0" />
                              <span className="hidden sm:inline">{t.scanBadgeBtn}</span>
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEventId(ev.id);
                            setFeedback(null);
                          }}
                          aria-label={
                            ev.locked
                              ? isEn
                                ? `View preview for ${ev.title}`
                                : `Voir l’aperçu de ${ev.title}`
                              : isEn
                                ? `Details and registration for ${ev.title}`
                                : `Détails et inscription ${ev.title}`
                          }
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full orange-glow-btn transition-all"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        );
      })()}

      {/* Professional Networks List */}
      {subTab === 'networks' && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredNetworks.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 porcelain-card rounded-3xl p-10 text-center">
              <p className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn
                  ? 'No professional network matches your search'
                  : 'Aucun réseau professionnel ne correspond à votre recherche'}
              </p>
              <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
                {isEn
                  ? 'Update keywords or reset filters to view all business circles.'
                  : 'Modifiez les mots-clés ou réinitialisez les filtres pour consulter tous les cercles.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCountryFilter('all');
                  setSectorFilter('all');
                }}
                className="mt-4 min-h-[44px] rounded-full orange-glow-btn px-6 text-xs font-semibold"
              >
                {isEn ? 'Reset search' : 'Réinitialiser la recherche'}
              </button>
            </div>
          ) : (
            filteredNetworks.map((net) => (
              <article
                key={net.id}
                className="porcelain-card flex flex-col justify-between rounded-[26px] p-5 space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#E85002] truncate">
                      {net.sectors.map((s) => translateSector(s, lang)).join(' · ')}
                    </span>
                    <span className="font-mono font-bold tabular-nums text-[#000000] dark:text-[#F9F9F9] shrink-0">
                      {net.memberCount} {isEn ? 'members' : 'membres'}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9] leading-snug">
                    {net.name}
                  </h2>
                  <p className="text-sm text-[#333333] dark:text-[#A7A7A7] leading-relaxed">
                    {net.publicSummary}
                  </p>

                  <div className="divide-y divide-[var(--ae-border)] border-t border-[var(--ae-border)] pt-1 text-xs">
                    <div className="flex items-center justify-between gap-3 py-2">
                      <span className="text-[#646464] dark:text-[#A7A7A7]">
                        {isEn ? 'Country corridor' : 'Corridor pays'}
                      </span>
                      <span className="font-semibold text-[#000000] dark:text-[#F9F9F9] truncate text-right">
                        {net.countries.map((c) => translateCountry(c, lang)).join(' · ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2">
                      <span className="text-[#646464] dark:text-[#A7A7A7]">
                        {isEn ? 'Circle access' : 'Statut du cercle'}
                      </span>
                      <span className="font-semibold text-[#E85002]">
                        {net.locked
                          ? isEn
                            ? 'Subscribers only'
                            : 'Réservé abonnés'
                          : isEn
                            ? 'Open access'
                            : 'Accès ouvert'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedNetwork(net)}
                  className="w-full min-h-[42px] inline-flex items-center justify-between rounded-full orange-glow-btn px-2 py-1 pl-4 text-xs font-semibold transition-all whitespace-nowrap"
                >
                  <span>
                    {net.locked
                      ? isEn
                        ? 'Preview circle'
                        : 'Aperçu du cercle'
                      : isEn
                        ? 'Explore circle'
                        : 'Consulter le cercle'}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-[#F9F9F9]">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              </article>
            ))
          )}
        </div>
      )}

      {/* Business Opportunities Board */}
      {subTab === 'opportunities' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 porcelain-card rounded-2xl p-4">
            <div className="flex items-center gap-2.5">
              <Briefcase className="h-5 w-5 text-[#E85002]" />
              <div>
                <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'B2B Opportunities Board' : 'Bourse aux opportunités B2B'}
                </p>
                <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                  {isEn
                    ? 'Commercial partners, co-investments & verified suppliers. Zero platform financial intermediation.'
                    : 'Partenaires commerciaux, co-investissements et fournisseurs. Aucune intermédiation financière sur la plateforme.'}
                </p>
              </div>
            </div>
            {isSubscriber ? (
              <button
                type="button"
                onClick={() => setOppModalOpen(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isEn ? 'Post opportunity' : 'Publier une opportunité'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (!user ? onOpenAuth() : onGoToSubscription())}
                className="min-h-[40px] rounded-full bg-[#F3EFEA] dark:bg-[#1E1E22] border border-[var(--ae-border)] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] whitespace-nowrap transition-colors"
              >
                {isEn ? 'Subscription required to post' : 'Abonnement requis pour publier'}
              </button>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredOpportunities.map((opp) => (
              <article
                key={opp.id}
                className="porcelain-card flex flex-col justify-between rounded-3xl p-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="rounded-full bg-[#E85002]/12 border border-[#E85002]/25 px-2.5 py-0.5 font-semibold text-[#E85002]">
                      {translateOppCategory(opp.category, lang)}
                    </span>
                    {opp.locked ? (
                      <span className="inline-flex items-center gap-1 font-medium text-[#8A5A2B] dark:text-[#D9C3AB]">
                        <Lock className="h-3 w-3" />
                        <span>{isEn ? 'Preview' : 'Aperçu'}</span>
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9]">
                        {translateSector(opp.sector, lang)}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-base font-bold text-[#000000] dark:text-[#F9F9F9] leading-snug">{opp.title}</h2>
                  <p className="mt-2 text-sm text-[#646464] dark:text-[#A7A7A7] leading-relaxed">{opp.publicSummary}</p>
                  <p className="mt-3 text-xs text-[#646464] dark:text-[#A7A7A7]">
                    {translateCountry(opp.country, lang)} · {opp.companyName}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--ae-border)] pt-3.5">
                  <span className="font-mono text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9] truncate pr-2">
                    {opp.budgetRange}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedOpp(opp)}
                    className="min-h-[38px] rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap"
                  >
                    {opp.locked ? (isEn ? 'Preview' : 'Aperçu') : isEn ? 'View' : 'Consulter'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-modal-title"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121214] border border-[var(--ae-border)] shadow-2xl">
            <div className="relative h-56 sm:h-64 w-full bg-[#121214]">
              {selectedEvent.imageUrl && (
                <img
                  src={selectedEvent.imageUrl}
                  alt={selectedEvent.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/35" />

              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedEventId(null)}
                  aria-label={isEn ? 'Close event details' : 'Fermer la fiche événement'}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] shadow-md hover:border hover:border-[#E85002]"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(selectedEvent.id)}
                    aria-pressed={favoriteEventIds.includes(selectedEvent.id)}
                    aria-label={
                      favoriteEventIds.includes(selectedEvent.id)
                        ? isEn
                          ? `Remove ${selectedEvent.title} from favorites`
                          : `Retirer ${selectedEvent.title} des favoris (fiche)`
                        : isEn
                          ? `Add ${selectedEvent.title} to favorites`
                          : `Ajouter ${selectedEvent.title} aux favoris (fiche)`
                    }
                    title={t.favoriteBtn}
                    className={`flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-colors ${
                      favoriteEventIds.includes(selectedEvent.id)
                        ? 'bg-[#E85002] text-[#F9F9F9] hover:bg-[#F16001]'
                        : 'bg-white dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] hover:border hover:border-[#E85002]'
                    }`}
                  >
                    <Heart
                      className={`h-4 w-4 ${
                        favoriteEventIds.includes(selectedEvent.id) ? 'fill-white text-white' : ''
                      }`}
                    />
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={() => setReportEventModalOpen(true)}
                      aria-label={isEn ? 'Report this event' : 'Signaler cet événement'}
                      title={isEn ? 'Report this event' : 'Signaler cet événement'}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] shadow-md hover:border hover:border-[#E85002]"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handleSpeakSummary(
                        selectedEvent.id,
                        `${selectedEvent.title}. ${selectedEvent.publicSummary}`
                      )
                    }
                    aria-label={isEn ? 'Listen to audio summary' : 'Écouter le résumé audio'}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] shadow-md hover:border hover:border-[#E85002]"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="-mt-5 relative rounded-t-3xl bg-white dark:bg-[#121214] p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-[#E85002]">
                  {selectedEvent.organizerName} · {translateSector(selectedEvent.sector, lang)}
                </p>
                <h2 id="event-modal-title" className="mt-1 text-2xl font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {selectedEvent.title}
                </h2>
                <p className="mt-1.5 text-xs text-[#646464] dark:text-[#A7A7A7]">
                  {selectedEvent.city}, {translateCountry(selectedEvent.country, lang)} ·{' '}
                  <span className="font-mono tabular-nums">
                    {new Date(selectedEvent.dateIso).toLocaleDateString(localeForLang(lang), {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 border-y border-[var(--ae-border)] py-4 text-center">
                {[
                  { icon: Globe, label: formatLabel(selectedEvent.format) },
                  {
                    icon: Users,
                    label: `${selectedEvent.registeredCount}/${selectedEvent.capacity} ${isEn ? 'seats' : 'places'}`,
                  },
                  {
                    icon: Ticket,
                    label:
                      selectedEvent.feeEur > 0
                        ? `${selectedEvent.feeEur} € ${isEn ? 'ticket' : 'billet'}`
                        : isEn
                          ? 'Plan incl.'
                          : 'Inclus abo.',
                  },
                  {
                    icon: Calendar,
                    label: selectedEvent.isRegistered
                      ? isEn
                        ? 'Registered'
                        : 'Inscrit'
                      : selectedEvent.locked
                        ? isEn
                          ? 'Preview'
                          : 'Aperçu'
                        : isEn
                          ? 'Open'
                          : 'Ouvert',
                  },
                ].map((spec) => {
                  const Icon = spec.icon;
                  return (
                    <div key={spec.label} className="flex flex-col items-center gap-1.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#E85002]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-[11px] font-medium text-[#333333] dark:text-[#A7A7A7] leading-tight">
                        {spec.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Overview' : 'Présentation'}
                </h3>
                <p className="mt-1.5 text-sm text-[#333333] dark:text-[#A7A7A7] leading-relaxed">
                  {selectedEvent.publicSummary}
                </p>
              </div>

              {(selectedEvent.format === 'in_person' || selectedEvent.format === 'hybrid') && (
                <div className="ice-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {isEn ? 'In-person networking (Camera OCR)' : 'Réseautage en présentiel (OCR Caméra)'}
                    </p>
                    <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7]">
                      {isEn
                        ? 'Scan an attendee badge to extract their profile automatically.'
                        : 'Scannez le badge d’un participant pour extraire son profil automatiquement.'}
                      {scannedBadges.filter((b) => b.eventId === selectedEvent.id).length > 0
                        ? ` (${scannedBadges.filter((b) => b.eventId === selectedEvent.id).length} ${
                            isEn ? 'scanned' : 'scanné(s)'
                          })`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBadgeScannerEvent(selectedEvent)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap"
                  >
                    <ScanLine className="h-3.5 w-3.5" />
                    <span>{isEn ? 'Scan badge (OCR)' : 'Scanner un badge (OCR)'}</span>
                  </button>
                </div>
              )}

              {selectedEvent.locked ? (
                <div className="ice-panel rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2.5 text-[#000000] dark:text-[#F9F9F9]">
                    <Lock className="h-5 w-5 shrink-0 text-[#E85002]" />
                    <h3 className="text-sm font-bold">
                      {isEn
                        ? 'Full program details and registration require an active membership'
                        : 'Détails complets et inscription réservés aux membres abonnés'}
                    </h3>
                  </div>
                  <p className="text-xs text-[#333333] dark:text-[#A7A7A7] leading-relaxed">
                    {isEn
                      ? 'With a Personal account you preview topic, city, date, and sector. Full agenda, exact venue or video link, and seat booking unlock immediately with a monthly or annual plan.'
                      : 'Avec un compte Personnel, vous consultez l’aperçu (sujet, ville, date et secteur). Le programme détaillé, l’adresse exacte ou le lien visioconférence ainsi que l’inscription sont protégés côté serveur et débloqués dès l’activation d’un abonnement mensuel ou annuel.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventId(null);
                      if (!user) onOpenAuth();
                      else onGoToSubscription();
                    }}
                    className="w-full min-h-[48px] flex items-center justify-between rounded-full orange-glow-btn px-2 py-1.5 pl-6 text-xs font-semibold transition-all"
                  >
                    <span>
                      {!user
                        ? isEn
                          ? 'Create an account or sign in'
                          : 'Créer un compte ou se connecter'
                        : isEn
                          ? 'View membership plans'
                          : 'Voir les offres d’abonnement'}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-[#F9F9F9]">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] p-4 space-y-2.5">
                    <h3 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                      {isEn ? 'Program & Logistics' : 'Programme & Modalités'}
                    </h3>
                    <p className="text-sm text-[#333333] dark:text-[#A7A7A7] leading-relaxed">
                      {selectedEvent.fullDescription}
                    </p>
                    {selectedEvent.highlights && selectedEvent.highlights.length > 0 && (
                      <ul className="pt-2 space-y-1.5 text-xs text-[#333333] dark:text-[#A7A7A7]">
                        {selectedEvent.highlights.map((h) => (
                          <li key={h} className="flex items-start gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#E85002] mt-0.5 shrink-0" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {!selectedEvent.isRegistered && (
                    <EventCalendarBookingSheet
                      event={selectedEvent}
                      allEvents={events}
                      selectedSlot={selectedSlot}
                      slots={sessionSlots}
                      lang={lang}
                      onSelectSlot={setSelectedSlot}
                      onSelectOtherEvent={(id) => {
                        setSelectedEventId(id);
                        setFeedback(null);
                      }}
                    />
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] p-3.5">
                      <p className="text-[#646464] dark:text-[#A7A7A7]">
                        {isEn ? 'Venue / Access' : 'Lieu / Accès'}
                      </p>
                      <p className="mt-1 font-semibold text-[#000000] dark:text-[#F9F9F9]">
                        {selectedEvent.venueAddress}
                      </p>
                      {selectedEvent.virtualLink && (
                        <p className="mt-1 font-mono text-[11px] text-[#E85002] break-all">
                          {selectedEvent.virtualLink}
                        </p>
                      )}
                    </div>
                    <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] p-3.5">
                      <p className="text-[#646464] dark:text-[#A7A7A7]">
                        {isEn ? 'Entry fee' : 'Frais d’entrée'}
                      </p>
                      <p className="mt-1 font-semibold text-[#000000] dark:text-[#F9F9F9]">
                        {selectedEvent.feeEur > 0
                          ? `${selectedEvent.feeEur} € (${isEn ? 'separate ticket' : 'billet distinct annoncé'})`
                          : isEn
                            ? 'No extra fee'
                            : 'Aucun frais supplémentaire'}
                      </p>
                    </div>
                  </div>

                  {feedback && (
                    <div
                      className={`rounded-2xl px-4 py-3 text-xs font-medium ${
                        feedback.type === 'ok'
                          ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {feedback.text}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(null)}
                      className="min-h-[48px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                    >
                      {isEn ? 'Close' : 'Fermer'}
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleRegisterToggle(selectedEvent)}
                      className={`flex-1 min-h-[48px] flex items-center justify-between rounded-full px-2 py-1.5 pl-5 text-sm font-semibold transition-all ${
                        selectedEvent.isRegistered
                          ? 'border border-[#C10801]/40 bg-[#C10801]/10 text-[#000000] dark:text-[#F9F9F9] hover:bg-[#C10801]/20'
                          : 'orange-glow-btn'
                      }`}
                    >
                      <span>
                        {actionBusy
                          ? isEn
                            ? 'Processing...'
                            : 'Traitement...'
                          : selectedEvent.isRegistered
                            ? isEn
                              ? 'Cancel registration'
                              : 'Annuler mon inscription'
                            : isEn
                              ? 'Confirm registration'
                              : 'Confirmer mon inscription'}
                      </span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[#F9F9F9]">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Network Detail Modal */}
      {selectedNetwork && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="network-modal-title"
        >
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#E85002]">
                  {selectedNetwork.sectors.map((s) => translateSector(s, lang)).join(' · ')}
                </p>
                <h2 id="network-modal-title" className="mt-1 text-xl font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {selectedNetwork.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNetwork(null)}
                aria-label={isEn ? 'Close network details' : 'Fermer la fiche réseau'}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-[#646464] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#E85002]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-[#333333] dark:text-[#A7A7A7] leading-relaxed">
              {selectedNetwork.publicSummary}
            </p>

            <div className="divide-y divide-[var(--ae-border)] border-y border-[var(--ae-border)] text-xs">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[#646464] dark:text-[#A7A7A7]">
                  {isEn ? 'Covered countries' : 'Pays couverts'}
                </span>
                <span className="font-semibold text-[#000000] dark:text-[#F9F9F9] text-right">
                  {selectedNetwork.countries.map((c) => translateCountry(c, lang)).join(' · ')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[#646464] dark:text-[#A7A7A7]">
                  {isEn ? 'Verified members' : 'Membres vérifiés'}
                </span>
                <span className="font-mono font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {selectedNetwork.memberCount}
                </span>
              </div>
            </div>

            {selectedNetwork.locked ? (
              <div className="ice-panel rounded-2xl p-4 space-y-3">
                <p className="text-xs text-[#000000] dark:text-[#F9F9F9] leading-relaxed">
                  {isEn
                    ? 'Circle contact details and member-only exchanges unlock with an active subscription.'
                    : 'Les coordonnées du cercle et les échanges réservés aux membres sont accessibles avec un abonnement actif.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNetwork(null);
                    if (!user) onOpenAuth();
                    else onGoToSubscription();
                  }}
                  className="min-h-[44px] rounded-full orange-glow-btn px-5 text-xs font-semibold"
                >
                  {isEn ? 'Upgrade membership' : 'Passer à l’abonnement'}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] p-4 space-y-2.5 text-sm text-[#000000] dark:text-[#F9F9F9]">
                <p>{selectedNetwork.fullDescription}</p>
                <div className="flex items-center gap-2 pt-2 text-xs font-semibold text-[#E85002]">
                  <Globe className="h-4 w-4 shrink-0" />
                  <span>
                    {isEn ? 'Coordinator contact:' : 'Contact coordination :'} {selectedNetwork.contactEmail}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Opportunity Detail Modal */}
      {selectedOpp && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#E85002]">
                  {translateOppCategory(selectedOpp.category, lang)} · {translateSector(selectedOpp.sector, lang)}
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#000000] dark:text-[#F9F9F9]">{selectedOpp.title}</h2>
                <p className="mt-1 text-xs text-[#646464] dark:text-[#A7A7A7]">
                  {translateCountry(selectedOpp.country, lang)} · {selectedOpp.companyName} ({selectedOpp.authorName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOpp(null)}
                aria-label={isEn ? 'Close opportunity' : 'Fermer la fiche opportunité'}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:bg-[#F3EFEA] dark:hover:bg-[#1E1E22] hover:text-[#000000] dark:hover:text-[#F9F9F9]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-[#333333] dark:text-[#D9C3AB] leading-relaxed">{selectedOpp.publicSummary}</p>

            {selectedOpp.locked ? (
              <div className="ice-panel rounded-2xl p-4 space-y-3">
                <p className="text-xs text-[#000000] dark:text-[#F9F9F9] leading-relaxed">
                  {isEn
                    ? 'Full opportunity details, lead contact, and deal range are reserved for active subscribers.'
                    : 'Les détails complets de l’opportunité, le porteur et la fourchette budgétaire sont réservés aux membres abonnés.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOpp(null);
                    if (!user) onOpenAuth();
                    else onGoToSubscription();
                  }}
                  className="min-h-[44px] rounded-full orange-glow-btn px-5 text-xs font-semibold"
                >
                  {isEn ? 'Activate subscription' : 'Activer l’abonnement'}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] p-4 space-y-2.5 text-sm text-[#333333] dark:text-[#F9F9F9]">
                <p>{selectedOpp.fullDetails}</p>
                <p className="pt-2 text-xs font-mono font-bold text-[#E85002]">
                  {isEn ? 'Budget / Volume:' : 'Enveloppe / Volume :'} {selectedOpp.budgetRange}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Publish Opportunity Modal */}
      {oppModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handlePublishOpportunity}
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Post a B2B Opportunity' : 'Publier une opportunité B2B'}
              </h2>
              <button
                type="button"
                onClick={() => setOppModalOpen(false)}
                aria-label={isEn ? 'Close' : 'Fermer'}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:bg-[#F3EFEA] dark:hover:bg-[#1E1E22]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              required
              aria-label={isEn ? 'Opportunity title' : 'Titre de l’opportunité'}
              value={oppTitle}
              onChange={(e) => setOppTitle(e.target.value)}
              placeholder={
                isEn
                  ? 'Ex: Exclusive distributor for West Africa'
                  : 'Ex: Distributeur exclusif Afrique de l’Ouest'
              }
              className="w-full min-h-[42px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label={isEn ? 'Category' : 'Catégorie'}
                value={oppCat}
                onChange={(e) => setOppCat(e.target.value as OpportunityCategory)}
                className="min-h-[42px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
              >
                <option value="commercial_partner">{isEn ? 'Commercial Partner' : 'Partenaire commercial'}</option>
                <option value="co_investment">{isEn ? 'Co-Investment' : 'Co-investissement'}</option>
                <option value="supplier">{isEn ? 'Supplier' : 'Fournisseur'}</option>
                <option value="call_for_projects">{isEn ? 'Call for Projects' : 'Appel à projets'}</option>
              </select>
              <select
                aria-label={isEn ? 'Sector' : 'Secteur'}
                value={oppSector}
                onChange={(e) => setOppSector(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
              >
                {CATALOG_CORE_SECTORS.map((sec) => (
                  <option key={sec} value={sec}>
                    {translateSector(sec, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label={isEn ? 'Country' : 'Pays'}
                value={oppCountry}
                onChange={(e) => setOppCountry(e.target.value)}
                className="min-h-[42px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
              >
                <optgroup label={isEn ? 'Africa (54)' : 'Afrique (54)'}>
                  {groupedCountries.africa.map((c) => (
                    <option key={c.isoNumeric} value={c.nameFr}>
                      {isEn ? c.nameEn : c.nameFr}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={isEn ? 'Diaspora (34)' : 'Diaspora (34)'}>
                  {groupedCountries.diaspora.map((c) => (
                    <option key={c.isoNumeric} value={c.nameFr}>
                      {isEn ? c.nameEn : c.nameFr}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                type="text"
                aria-label={isEn ? 'Budget or volume' : 'Enveloppe ou volume'}
                value={oppBudget}
                onChange={(e) => setOppBudget(e.target.value)}
                placeholder="Ex: 50k–150k €"
                className="min-h-[42px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
              />
            </div>
            <input
              type="text"
              required
              aria-label={isEn ? 'Public summary' : 'Résumé public'}
              value={oppSummary}
              onChange={(e) => setOppSummary(e.target.value)}
              placeholder={isEn ? 'Short preview summary...' : 'Résumé court visible en aperçu...'}
              className="w-full min-h-[42px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
            />
            <textarea
              rows={3}
              aria-label={isEn ? 'Full details' : 'Détails complets'}
              value={oppDetails}
              onChange={(e) => setOppDetails(e.target.value)}
              placeholder={
                isEn
                  ? 'Full specifications and collaboration criteria (subscribers)...'
                  : 'Cahier des charges et critères de collaboration (abonnés)...'
              }
              className="w-full rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
            />
            <button
              type="submit"
              disabled={actionBusy}
              className="w-full min-h-[44px] rounded-full orange-glow-btn text-xs font-semibold"
            >
              {isEn ? 'Publish opportunity' : 'Publier l’opportunité'}
            </button>
          </form>
        </div>
      )}

      {/* Report Event Modal */}
      {reportEventModalOpen && selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleReportEvent}
            className="w-full max-w-md rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
              {isEn ? 'Report this event' : 'Signaler cet événement'}
            </h3>
            <textarea
              rows={3}
              required
              value={reportEventReason}
              onChange={(e) => setReportEventReason(e.target.value)}
              placeholder={isEn ? 'Describe the issue...' : 'Décrivez le motif du signalement...'}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportEventModalOpen(false)}
                className="min-h-[40px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#333333] dark:text-[#F9F9F9]"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-full orange-glow-btn px-5 text-xs font-semibold"
              >
                {isEn ? 'Submit' : 'Envoyer'}
              </button>
            </div>
          </form>
        </div>
      )}
      <BadgeScannerModal
        isOpen={Boolean(badgeScannerEvent)}
        event={badgeScannerEvent}
        mode="event_contact"
        isAuthenticated={Boolean(user)}
        lang={lang}
        onClose={() => setBadgeScannerEvent(null)}
        onSaveBadgeContact={async (badge) => {
          await onSaveBadgeContact?.(badge);
          setFeedback({
            type: 'ok',
            text: isEn
              ? `${badge.fullName}'s badge extracted via OCR and saved to your network.`
              : `Badge de ${badge.fullName} extrait par OCR et enregistré dans votre réseau.`,
          });
        }}
      />
    </div>
  );
};
