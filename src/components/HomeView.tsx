import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BellRing,
  Building2,
  Calendar,
  Compass,
  Heart,
  KeyRound,
  Lock,
  MapPin,
  MessageSquare,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type {
  BusinessEvent,
  ContactConnection,
  EventRecommendation,
  EventRegistration,
  MemberAccount,
  ProfessionalNetwork,
  RecommendationsResponse,
  ScannedBadgeContact,
} from '../types/domain';
import { apiFetch } from '../lib/apiClient';
import { hasActiveSubscription } from '../lib/accessRules';
import { getEventAvailabilityStatus } from '../lib/calendarSync';
import {
  UI_COPY,
  localeForLang,
  translateCountry,
  translateSector,
  type AppLanguage,
} from '../lib/i18n';
import { NetworkingTrendsCard } from './NetworkingTrendsCard';

interface HomeViewProps {
  user: MemberAccount | null;
  events: BusinessEvent[];
  networks: ProfessionalNetwork[];
  registrations: EventRegistration[];
  connections?: ContactConnection[];
  scannedBadges?: ScannedBadgeContact[];
  favoriteEventIds: string[];
  onlineUsers: string[];
  lang: AppLanguage;
  darkMode?: boolean;
  favoriteReminderEnabled?: boolean;
  notifPermission?: NotificationPermission | 'unsupported';
  onEnableFavoriteReminders?: () => Promise<void> | void;
  onToggleFavoriteReminders?: (enabled: boolean) => Promise<void> | void;
  onTestFavoriteReminder?: () => Promise<boolean> | void;
  onOpenBadgeScanner?: () => void;
  onNavigate: (
    tab: 'home' | 'catalogue' | 'subscription' | 'directory' | 'messages' | 'organizer' | 'admin',
    opts?: { sector?: string; eventId?: string; searchQuery?: string }
  ) => void;
  onToggleFavorite: (eventId: string) => void;
  onOpenAuth: () => void;
}

const FEATURED_CONTACTS = [
  {
    id: 'u-amina',
    name: 'Amina D.',
    roleFr: 'Fintech · Dakar',
    roleEn: 'Fintech · Dakar',
    avatar: '/src/assets/images/avatar_amina_1795137734029.jpg',
  },
  {
    id: 'u-kwame',
    name: 'Kwame M.',
    roleFr: 'Venture · Londres',
    roleEn: 'Venture · London',
    avatar: '/src/assets/images/avatar_kwame_1795137732755.jpg',
  },
  {
    id: 'u-fatou',
    name: 'Fatou N.',
    roleFr: 'EdTech · Montréal',
    roleEn: 'EdTech · Montreal',
    avatar: '/src/assets/images/avatar_fatou_1795139287344.jpg',
  },
  {
    id: 'u-chidi',
    name: 'Chidi O.',
    roleFr: 'Studio · Lagos',
    roleEn: 'Studio · Lagos',
    avatar: '/src/assets/images/avatar_chidi_1795139287332.jpg',
  },
];

const MODE_LABELS: Array<{ id: 'all' | BusinessEvent['format']; labelFr: string; labelEn: string }> = [
  { id: 'all', labelFr: 'Tous', labelEn: 'All' },
  { id: 'in_person', labelFr: 'Présentiel', labelEn: 'In-Person' },
  { id: 'hybrid', labelFr: 'Hybride', labelEn: 'Hybrid' },
  { id: 'virtual', labelFr: 'En ligne', labelEn: 'Online' },
];

function formatEventModeLabel(format: BusinessEvent['format'], lang: 'fr' | 'en'): string {
  const found = MODE_LABELS.find((m) => m.id === format);
  if (!found) return format;
  return lang === 'en' ? found.labelEn : found.labelFr;
}

export const HomeView: React.FC<HomeViewProps> = ({
  user,
  events,
  networks,
  registrations,
  connections = [],
  scannedBadges = [],
  favoriteEventIds,
  onlineUsers,
  lang,
  darkMode = true,
  favoriteReminderEnabled = true,
  notifPermission = 'default',
  onEnableFavoriteReminders,
  onToggleFavoriteReminders,
  onTestFavoriteReminder,
  onOpenBadgeScanner,
  onNavigate,
  onToggleFavorite,
  onOpenAuth,
}) => {
  const t = UI_COPY[lang];
  const isEn = lang === 'en';
  const dateLocale = localeForLang(lang);
  const isSubscriber = hasActiveSubscription(user);
  const [selectedDateKey, setSelectedDateKey] = useState<string>('all');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedMode, setSelectedMode] = useState<'all' | BusinessEvent['format']>('all');
  const [homeSearch, setHomeSearch] = useState<string>('');
  const [recommendations, setRecommendations] = useState<EventRecommendation[]>([]);
  const [reminderTestMsg, setReminderTestMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<RecommendationsResponse>(`/api/analytics/recommendations?lang=${lang}`)
      .then((res) => {
        if (active && Array.isArray(res.recommendations)) {
          setRecommendations(res.recommendations);
        }
      })
      .catch(() => {
        // Keep silent fallback
      });
    return () => {
      active = false;
    };
  }, [user?.id, lang, events.length, favoriteEventIds.length, registrations.length]);

  const topSectors = useMemo(() => {
    const uniq = Array.from(new Set(events.map((e) => e.sector).filter(Boolean)));
    return uniq.slice(0, 4);
  }, [events]);

  const filteredHomeEvents = useMemo(() => {
    return events.filter((ev) => {
      if (selectedSector !== 'all' && ev.sector !== selectedSector) return false;
      if (selectedMode !== 'all' && ev.format !== selectedMode) return false;
      if (selectedDateKey !== 'all' && ev.dateIso.slice(0, 10) !== selectedDateKey) return false;
      return true;
    });
  }, [events, selectedSector, selectedMode, selectedDateKey]);

  const featuredEvent = filteredHomeEvents[0] || events[0];
  const runnerUpEvent =
    filteredHomeEvents.find((e) => e.id !== featuredEvent?.id) ||
    events.find((e) => e.id !== featuredEvent?.id);
  const bentoSecondaryEvents = (filteredHomeEvents.length > 1 ? filteredHomeEvents : events)
    .filter((e) => e.id !== featuredEvent?.id)
    .slice(0, 2);

  const favoriteEvents = events.filter((ev) => favoriteEventIds.includes(ev.id));
  const registeredCount = registrations.length || events.filter((e) => e.isRegistered).length;

  const agendaDateSlots = useMemo(() => {
    const seen = new Set<string>();
    const slots: Array<{ id: string; dateKey: string; dayShort: string; dayNum: string }> = [];
    for (const ev of events) {
      const dateKey = ev.dateIso.slice(0, 10);
      if (seen.has(dateKey)) continue;
      seen.add(dateKey);
      const dt = new Date(ev.dateIso);
      slots.push({
        id: ev.id,
        dateKey,
        dayShort: dt
          .toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'short' })
          .replace('.', '')
          .slice(0, 3),
        dayNum: dt.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: '2-digit' }),
      });
      if (slots.length >= 6) break;
    }
    return slots;
  }, [events, lang]);

  const agendaEvents = useMemo(() => {
    const pool = filteredHomeEvents.length > 0 ? filteredHomeEvents : events;
    return pool.slice(0, 4);
  }, [filteredHomeEvents, events]);

  const handleHomeSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate('catalogue', { searchQuery: homeSearch.trim() });
  };

  const handleReminderToggleClick = async () => {
    const nextState = !favoriteReminderEnabled;
    if (onToggleFavoriteReminders) {
      await onToggleFavoriteReminders(nextState);
    } else if (nextState && onEnableFavoriteReminders) {
      await onEnableFavoriteReminders();
    }
  };

  const handleTestReminderClick = async () => {
    if (!onTestFavoriteReminder) return;
    const ok = await onTestFavoriteReminder();
    setReminderTestMsg(
      ok
        ? lang === 'en'
          ? 'Test push alert sent!'
          : 'Alerte test -30 min envoyée !'
        : lang === 'en'
          ? 'Saved to notification center'
          : 'Ajoutée au centre de notifications'
    );
    window.setTimeout(() => setReminderTestMsg(null), 3500);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Greeting + Search Capsule Row (Images 2 & 3 Showcase Header) */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-full object-cover ring-2 ring-[#E85002]/70 shadow-md shrink-0"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F16001] to-[#C10801] text-sm font-bold text-[#F9F9F9] shadow-[0_8px_20px_-6px_rgba(232,80,2,0.75)]">
                {user ? user.fullName.slice(0, 2).toUpperCase() : 'AE'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#646464] dark:text-[#A7A7A7] truncate">
                {user
                  ? lang === 'en'
                    ? 'Ready to grow your network?'
                    : 'Prêt à développer votre réseau ?'
                  : t.visitorSubtitle}
              </p>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#000000] dark:text-[#F9F9F9] truncate">
                  {user ? `${lang === 'en' ? 'Hey' : 'Bonjour'}, ${user.fullName.split(' ')[0]}` : 'Africa Entrepreneur'}
                </h1>
                <span className="hidden sm:inline-flex items-center rounded-full bg-[#E85002]/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#E85002]">
                  {events.length} LIVE
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="min-h-[42px] inline-flex items-center gap-2 rounded-full orange-glow-btn px-5 text-xs font-semibold transition-all whitespace-nowrap"
              >
                <span>{isEn ? 'Create account' : 'Créer un compte'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : !isSubscriber ? (
              <button
                type="button"
                onClick={() => onNavigate('subscription')}
                className="min-h-[42px] inline-flex items-center gap-2 rounded-full orange-glow-btn px-5 text-xs font-semibold transition-all whitespace-nowrap"
              >
                <span>{isEn ? 'Activate Pro Pass' : 'Activer le Pass Pro'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('directory')}
                className="min-h-[42px] inline-flex items-center gap-2 rounded-full orange-glow-btn px-5 text-xs font-semibold transition-all whitespace-nowrap"
              >
                <span>{isEn ? 'Open directory' : 'Ouvrir l’annuaire'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Frosted Search Capsule (Image 2 signature) */}
        <form
          onSubmit={handleHomeSearchSubmit}
          className="flex items-center gap-2 rounded-2xl border border-[var(--ae-border)] bg-white/90 dark:bg-[#141417]/90 px-3.5 py-2 shadow-sm backdrop-blur-md focus-within:border-[#E85002] transition-colors"
        >
          <Search className="h-4 w-4 text-[#646464] dark:text-[#A7A7A7] shrink-0" />
          <input
            type="search"
            value={homeSearch}
            onChange={(e) => setHomeSearch(e.target.value)}
            placeholder={
              lang === 'en'
                ? 'Browse summits, cities, sectors or hosts...'
                : 'Rechercher un sommet, une ville, un secteur ou un hôte...'
            }
            aria-label={lang === 'en' ? 'Search for an event' : 'Rechercher un événement'}
            className="w-full bg-transparent text-xs sm:text-sm text-[#000000] dark:text-[#F9F9F9] placeholder-[#646464] dark:placeholder-[#A7A7A7] focus:outline-none"
          />
          <button
            type="submit"
            aria-label={lang === 'en' ? 'Filter catalog' : 'Filtrer le catalogue'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#000000] dark:text-[#F9F9F9] hover:bg-[#E85002] hover:text-[#F9F9F9] transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Row 1: Homex Bento Hub Card (Image 3) + Horizontal 7-Day Date Pill Strip (Image 2) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
        {/* Left 7 cols: Homex-Inspired Bento Member Hub Card */}
        <div className="lg:col-span-7 min-w-0 navy-card rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-4 relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#D9C3AB] uppercase tracking-wider">
                {!user
                  ? isEn
                    ? 'Business Corridor · Open Previews'
                    : 'Corridor Business · Aperçus ouverts'
                  : isSubscriber
                    ? isEn
                      ? `${user.subscriptionPlan === 'annual' ? 'Annual' : 'Monthly'} Pass · Active`
                      : `Pass ${user.subscriptionPlan === 'annual' ? 'Annuel' : 'Mensuel'} · Actif`
                    : isEn
                      ? 'Personal Workspace · Active Previews'
                      : 'Espace Personnel · Aperçus actifs'}
              </p>
              <h2 className="mt-1 text-lg sm:text-xl font-bold text-[#F9F9F9]">
                {user ? `${user.fullName.split(' ')[0]}’s Business Hub` : 'Africa Business Hub'}
              </h2>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] font-medium text-[#F9F9F9] backdrop-blur-md">
              <MapPin className="h-3.5 w-3.5 text-[#E85002]" />
              <span>Dakar · Abidjan · Lagos · Paris</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2.5">
                {FEATURED_CONTACTS.map((c) => (
                  <img
                    key={c.id}
                    src={c.avatar}
                    alt={c.name}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-[#121214]"
                  />
                ))}
              </div>
              <span className="font-mono text-xs font-semibold text-[#F9F9F9] tabular-nums">
                {Math.max(428, networks.length * 64)}+ {isEn ? 'executives' : 'dirigeants'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onNavigate(isSubscriber ? 'directory' : 'subscription')}
              className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-[#F9F9F9] hover:bg-[#E85002] hover:border-[#E85002] transition-colors"
            >
              {isSubscriber ? (isEn ? 'My passport' : 'Mon passeport') : isEn ? 'Pro Plans' : 'Formules Pro'}
            </button>
          </div>

          {/* 3-Column Recessed KPI Strip (Image 3 signature) */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/45 p-3 sm:p-3.5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[#F16001]">
                  <Calendar className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-lg sm:text-2xl font-bold text-[#F9F9F9] tabular-nums">
                  {events.length}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#F9F9F9]">{t.eventsTab}</p>
              <p className="text-[10px] text-[#A7A7A7]">{isEn ? 'Published' : 'Publiés'}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/45 p-3 sm:p-3.5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[#D9C3AB]">
                  <Users className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-lg sm:text-2xl font-bold text-[#F9F9F9] tabular-nums">
                  {networks.length}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#F9F9F9]">{t.networksTab}</p>
              <p className="text-[10px] text-[#A7A7A7]">{isEn ? 'Certified' : 'Certifiés'}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/45 p-3 sm:p-3.5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[#E85002]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-lg sm:text-2xl font-bold text-[#F9F9F9] tabular-nums">
                  {isSubscriber ? registeredCount : Math.max(12, onlineUsers.length)}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#F9F9F9]">
                {isSubscriber ? (isEn ? 'Registrations' : 'Inscriptions') : isEn ? 'Online' : 'En ligne'}
              </p>
              <p className="text-[10px] text-[#A7A7A7]">
                {isSubscriber ? (isEn ? 'Confirmed' : 'Confirmées') : isEn ? 'Active' : 'Actifs'}
              </p>
            </div>
          </div>

          {/* Sector Quick-Filter Chips (Image 3 chip bar: + Explorer in Orange + glass pills) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => onNavigate('catalogue', { sector: selectedSector })}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[#E85002] px-3.5 text-xs font-bold text-[#F9F9F9] hover:bg-[#F16001] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isEn ? 'Explore' : 'Explorer'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedSector('all')}
              className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                selectedSector === 'all'
                  ? 'bg-[#F9F9F9] text-[#000000]'
                  : 'border border-white/15 bg-white/8 text-[#F9F9F9]/85 hover:bg-white/15'
              }`}
            >
              {isEn ? 'All' : 'Tout'}
            </button>
            {topSectors.map((sector) => (
              <button
                key={sector}
                type="button"
                onClick={() => setSelectedSector((prev) => (prev === sector ? 'all' : sector))}
                className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                  selectedSector === sector
                    ? 'bg-[#F9F9F9] text-[#000000]'
                    : 'border border-white/15 bg-white/8 text-[#F9F9F9]/85 hover:bg-white/15'
                }`}
              >
                {translateSector(sector, lang)}
              </button>
            ))}
          </div>
        </div>

        {/* Right 5 cols: Image 2 Horizontal Date Strip + Orange-Glow KPI & Reminder Status */}
        <div className="lg:col-span-5 min-w-0 porcelain-card rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Summit Calendar' : 'Calendrier des sommets'}
              </h2>
              <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                {isEn ? 'Select a day to filter featured events' : 'Sélectionnez un jour pour filtrer la une'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('catalogue')}
              className="text-xs font-semibold text-[#E85002] hover:text-[#F16001]"
            >
              {isEn ? 'View all' : 'Tout voir'}
            </button>
          </div>

          {/* Glowing Orange Pill Date Strip (Image 2 signature) */}
          {agendaDateSlots.length > 0 && (
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1"
              role="tablist"
              aria-label={isEn ? 'Filter by date' : 'Filtrer par date'}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedDateKey === 'all'}
                onClick={() => setSelectedDateKey('all')}
                className={`flex h-16 min-w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl px-2.5 text-xs font-bold transition-all ${
                  selectedDateKey === 'all'
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_10px_22px_-6px_rgba(232,80,2,0.75)]'
                    : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#333333] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider opacity-85">{isEn ? 'All' : 'Tout'}</span>
                <span className="mt-0.5 font-mono text-sm font-bold">{events.length}</span>
              </button>
              {agendaDateSlots.map((slot) => {
                const active = selectedDateKey === slot.dateKey;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDateKey((prev) => (prev === slot.dateKey ? 'all' : slot.dateKey))}
                    className={`flex h-16 min-w-[50px] shrink-0 flex-col items-center justify-center rounded-2xl px-2.5 transition-all ${
                      active
                        ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_10px_22px_-6px_rgba(232,80,2,0.75)]'
                        : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#333333] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                    }`}
                  >
                    <span className={`text-[10px] font-semibold capitalize ${active ? 'text-[#F9F9F9]/90' : 'text-[#E85002]'}`}>
                      {slot.dayShort}
                    </span>
                    <span className="mt-0.5 font-mono text-sm font-bold tabular-nums">{slot.dayNum}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Direct 4-Access Bar */}
          <div className="grid grid-cols-4 gap-2 pt-1 border-t border-[var(--ae-border)]">
            {[
              { id: 'catalogue' as const, label: t.navCatalogue, icon: Compass, highlight: true },
              { id: 'directory' as const, label: isEn ? 'Directory' : 'Annuaire', icon: Building2, highlight: false },
              { id: 'messages' as const, label: t.navMessages, icon: MessageSquare, highlight: false },
              { id: 'subscription' as const, label: isEn ? 'Pro Pass' : 'Pass Pro', icon: ShieldCheck, highlight: false },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="group flex flex-col items-center gap-1.5 rounded-2xl py-2 hover:bg-[#F3EFEA] dark:hover:bg-[#1A1A1D] transition-colors"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                      item.highlight
                        ? 'bg-[#E85002] text-[#F9F9F9]'
                        : 'bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#000000] dark:text-[#F9F9F9] group-hover:bg-[#E85002] group-hover:text-[#F9F9F9]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-[#333333] dark:text-[#A7A7A7] group-hover:text-[#000000] dark:group-hover:text-[#F9F9F9]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Image 2 Signature Dual Event Cards — Warm Branding Gradient Card + Dark Glass Orange-CTA Card */}
      {featuredEvent && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Card A: Signature #D9C3AB -> #F16001 -> #C10801 -> #1A0400 Gradient Card with Dark CTA */}
          <div className="lg:col-span-6 brand-gradient-card rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white/25 px-3 py-1 text-[#F9F9F9] backdrop-blur-sm">
                  {lang === 'en'
                    ? getEventAvailabilityStatus(featuredEvent).labelEn
                    : getEventAvailabilityStatus(featuredEvent).labelFr}
                </span>
                <span className="text-[#F9F9F9]/90 font-mono tabular-nums">
                  {new Date(featuredEvent.dateIso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleFavorite(featuredEvent.id)}
                aria-pressed={favoriteEventIds.includes(featuredEvent.id)}
                aria-label={
                  favoriteEventIds.includes(featuredEvent.id)
                    ? isEn
                      ? `Remove ${featuredEvent.title} from favorites`
                      : `Retirer ${featuredEvent.title} des favoris`
                    : isEn
                      ? `Add ${featuredEvent.title} to favorites`
                      : `Ajouter ${featuredEvent.title} aux favoris`
                }
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  favoriteEventIds.includes(featuredEvent.id)
                    ? 'bg-[#000000] text-[#E85002]'
                    : 'bg-white/20 text-[#F9F9F9] hover:bg-white/30'
                }`}
              >
                <Heart
                  className={`h-4 w-4 ${
                    favoriteEventIds.includes(featuredEvent.id) ? 'fill-[#E85002] text-[#E85002]' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-[#F9F9F9] leading-tight">
                  {featuredEvent.title}
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-[#F9F9F9]/85">
                  {featuredEvent.city}, {translateCountry(featuredEvent.country, lang)} · {translateSector(featuredEvent.sector, lang)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-lg sm:text-xl font-bold text-[#F9F9F9] tabular-nums">
                  {formatEventModeLabel(featuredEvent.format, lang)}
                </p>
                <p className="font-mono text-xs text-[#F9F9F9]/85 tabular-nums">
                  {featuredEvent.registeredCount}/{featuredEvent.capacity} {isEn ? 'seats' : 'places'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('catalogue', { eventId: featuredEvent.id })}
              className="w-full min-h-[46px] rounded-2xl bg-[#121214] px-5 text-sm font-bold text-[#F9F9F9] hover:bg-[#000000] transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              <span>
                {featuredEvent.locked
                  ? isEn
                    ? 'Free preview'
                    : 'Voir l’aperçu gratuit'
                  : isEn
                    ? 'Join event'
                    : 'Rejoindre l’événement'}
              </span>
              <ArrowRight className="h-4 w-4 text-[#F16001]" />
            </button>
          </div>

          {/* Card B: Obsidian Dark Glass Card with Solid #E85002 Orange CTA (Image 2 Card 2) */}
          {runnerUpEvent && (
            <div className="lg:col-span-6 porcelain-card rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-[#E85002]/15 px-3 py-1 text-[#E85002]">
                    {lang === 'en'
                      ? getEventAvailabilityStatus(runnerUpEvent).labelEn
                      : getEventAvailabilityStatus(runnerUpEvent).labelFr}
                  </span>
                  <span className="text-[#646464] dark:text-[#A7A7A7] font-mono tabular-nums">
                    {new Date(runnerUpEvent.dateIso).toLocaleDateString(dateLocale, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(runnerUpEvent.id)}
                  aria-pressed={favoriteEventIds.includes(runnerUpEvent.id)}
                  aria-label={
                    favoriteEventIds.includes(runnerUpEvent.id)
                      ? isEn
                        ? `Remove ${runnerUpEvent.title} from favorites`
                        : `Retirer ${runnerUpEvent.title} des favoris`
                      : isEn
                        ? `Add ${runnerUpEvent.title} to favorites`
                        : `Ajouter ${runnerUpEvent.title} aux favoris`
                  }
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                    favoriteEventIds.includes(runnerUpEvent.id)
                      ? 'border-[#E85002] bg-[#E85002]/15 text-[#E85002]'
                      : 'border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1E1E22] text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002]'
                  }`}
                >
                  <Heart
                    className={`h-4 w-4 ${
                      favoriteEventIds.includes(runnerUpEvent.id) ? 'fill-[#E85002] text-[#E85002]' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] leading-tight">
                    {runnerUpEvent.title}
                  </h2>
                  <p className="mt-1.5 text-xs sm:text-sm text-[#646464] dark:text-[#A7A7A7]">
                    {runnerUpEvent.city}, {translateCountry(runnerUpEvent.country, lang)} · {runnerUpEvent.organizerName}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-lg sm:text-xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
                    {formatEventModeLabel(runnerUpEvent.format, lang)}
                  </p>
                  <p className="font-mono text-xs text-[#646464] dark:text-[#A7A7A7] tabular-nums">
                    {runnerUpEvent.registeredCount}/{runnerUpEvent.capacity} {isEn ? 'seats' : 'places'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('catalogue', { eventId: runnerUpEvent.id })}
                className="w-full min-h-[46px] rounded-2xl orange-glow-btn px-5 text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                <span>
                  {runnerUpEvent.locked
                    ? isEn
                      ? 'Explore summit'
                      : 'Découvrir le sommet'
                    : isEn
                      ? 'Open session'
                      : 'Ouvrir la session'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Row 3: Image 3 "Actions rapides" 2x2 Bento Tiles + Mode Switcher + Photographic Bento */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        {/* Left 5 cols: Image 3 "Actions rapides" 2x2 Bento Grid + Mode Switcher */}
        <div className="lg:col-span-5 min-w-0 porcelain-card rounded-3xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Quick Actions' : 'Actions rapides'}
              </h2>
              <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                {isEn ? 'Executive tools in one tap' : 'Outils exécutifs en un geste'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('catalogue')}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-[#E85002] px-3 text-xs font-bold text-[#F9F9F9] hover:bg-[#F16001] transition-colors"
            >
              <span>{t.navCatalogue}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Tile 1: Real Working 30-min Push Reminders Toggle */}
            <div className="rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#E85002]">
                  {favoriteReminderEnabled ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <button
                  type="button"
                  onClick={handleTestReminderClick}
                  title={t.reminderTestBtn}
                  aria-label={t.reminderTestBtn}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#000000] dark:text-[#F9F9F9] hover:bg-[#E85002] hover:text-[#F9F9F9] transition-colors"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? '30m Reminders' : 'Rappels -30 min'}
                </p>
                <p className="text-[10px] text-[#646464] dark:text-[#A7A7A7] truncate">
                  {reminderTestMsg ||
                    (favoriteReminderEnabled
                      ? isEn
                        ? 'Favorite push active'
                        : 'Push favoris actif'
                      : isEn
                        ? 'Paused'
                        : 'En pause')}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#646464] dark:text-[#A7A7A7]">
                  {favoriteReminderEnabled ? (isEn ? 'Active' : 'Activé') : isEn ? 'Off' : 'Désactivé'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={favoriteReminderEnabled}
                  aria-label={isEn ? 'Toggle 30-minute reminders' : 'Activer ou couper les rappels 30 minutes avant'}
                  onClick={handleReminderToggleClick}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    favoriteReminderEnabled ? 'bg-[#E85002]' : 'bg-[#A7A7A7]/50 dark:bg-[#333333]'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-[#F9F9F9] shadow-sm transition-transform ${
                      favoriteReminderEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Tile 2: Quick Badge OCR Scanner */}
            <button
              type="button"
              onClick={() => onOpenBadgeScanner?.()}
              className="group rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-left flex flex-col justify-between gap-3 hover:border-[#E85002] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#E85002]">
                  <ScanLine className="h-4 w-4" />
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#000000] dark:text-[#F9F9F9] group-hover:bg-[#E85002] group-hover:text-[#F9F9F9] transition-colors">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'OCR Scanner' : 'Scanner OCR'}
                </p>
                <p className="text-[10px] text-[#646464] dark:text-[#A7A7A7]">
                  {scannedBadges.length} {isEn ? 'scanned contact(s)' : 'contact(s) scanné(s)'}
                </p>
              </div>
              <span className="font-mono text-[10px] font-bold text-[#E85002]">
                {isEn ? 'Instant capture' : 'Capture instantanée'}
              </span>
            </button>

            {/* Tile 3: E2EE Key & Directory */}
            <button
              type="button"
              onClick={() => onNavigate(isSubscriber ? 'messages' : 'subscription')}
              className="group rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-left flex flex-col justify-between gap-3 hover:border-[#E85002] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#E85002]">
                  <KeyRound className="h-4 w-4" />
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#000000] dark:text-[#F9F9F9] group-hover:bg-[#E85002] group-hover:text-[#F9F9F9] transition-colors">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'E2EE Messaging' : 'Messagerie E2EE'}
                </p>
                <p className="text-[10px] text-[#646464] dark:text-[#A7A7A7]">
                  {isEn ? 'ECDH P-256 Keys' : 'Clés ECDH P-256'}
                </p>
              </div>
              <span className="font-mono text-[10px] font-bold text-[#000000] dark:text-[#D9C3AB]">
                {isSubscriber
                  ? isEn
                    ? 'Encryption active'
                    : 'Chiffrement actif'
                  : isEn
                    ? 'Pro Pass required'
                    : 'Pass Pro requis'}
              </span>
            </button>

            {/* Tile 4: Verified Networks Explorer */}
            <button
              type="button"
              onClick={() => onNavigate('directory')}
              className="group rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-left flex flex-col justify-between gap-3 hover:border-[#E85002] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#E85002]">
                  <Users className="h-4 w-4" />
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white dark:bg-[#26262B] text-[#000000] dark:text-[#F9F9F9] group-hover:bg-[#E85002] group-hover:text-[#F9F9F9] transition-colors">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn ? 'Directory & Match' : 'Annuaire & Match'}
                </p>
                <p className="text-[10px] text-[#646464] dark:text-[#A7A7A7]">
                  {connections.length} {isEn ? 'connection(s)' : 'connexion(s)'}
                </p>
              </div>
              <span className="font-mono text-[10px] font-bold text-[#000000] dark:text-[#D9C3AB]">
                {isEn ? 'Python Matching' : 'Matching Python'}
              </span>
            </button>
          </div>

          {/* Image 3 "Change Your Mode" Format Filter Bar */}
          <div className="space-y-2 pt-2 border-t border-[var(--ae-border)]">
            <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
              {isEn ? 'Session format' : 'Format de session'}
            </p>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {MODE_LABELS.map((m) => {
                const active = selectedMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMode(m.id)}
                    className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[#E85002] text-[#F9F9F9] shadow-sm'
                        : 'border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#333333] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                    }`}
                  >
                    {lang === 'en' ? m.labelEn : m.labelFr}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 7 cols: Photographic Bento Cards (Image 3 room cards style with circular arrow button) */}
        <div className="lg:col-span-7 min-w-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {featuredEvent && (
            <div className="sm:col-span-2 group relative min-h-[240px] overflow-hidden rounded-3xl porcelain-card">
              {featuredEvent.imageUrl && (
                <img
                  src={featuredEvent.imageUrl}
                  alt={featuredEvent.title}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/15" />
              <div className="relative flex h-full flex-col justify-between p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-[#F9F9F9] backdrop-blur-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#E85002]" />
                    <span>
                      {featuredEvent.organizerName} · {translateSector(featuredEvent.sector, lang)}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    {featuredEvent.locked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-[#D9C3AB] backdrop-blur-md">
                        <Lock className="h-3 w-3" />
                        <span>{isEn ? 'Preview' : 'Aperçu'}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(featuredEvent.id)}
                      aria-pressed={favoriteEventIds.includes(featuredEvent.id)}
                      aria-label={
                        favoriteEventIds.includes(featuredEvent.id)
                          ? isEn
                            ? `Remove ${featuredEvent.title} from favorites`
                            : `Retirer ${featuredEvent.title} des favoris (aperçu)`
                          : isEn
                            ? `Add ${featuredEvent.title} to favorites`
                            : `Ajouter ${featuredEvent.title} aux favoris (aperçu)`
                      }
                      className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                        favoriteEventIds.includes(featuredEvent.id)
                          ? 'bg-[#E85002] text-[#F9F9F9]'
                          : 'bg-black/55 text-[#F9F9F9] hover:bg-[#E85002]'
                      }`}
                    >
                      <Heart
                        className={`h-4 w-4 ${
                          favoriteEventIds.includes(featuredEvent.id) ? 'fill-white text-white' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="mt-20 flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-[#F9F9F9]">{featuredEvent.title}</h3>
                    <p className="mt-1 text-xs text-[#D9C3AB]">
                      {featuredEvent.city}, {translateCountry(featuredEvent.country, lang)} ·{' '}
                      {featuredEvent.registeredCount}/{featuredEvent.capacity} {isEn ? 'seats' : 'places'}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={isEn ? `Open ${featuredEvent.title}` : `Ouvrir ${featuredEvent.title}`}
                    onClick={() => onNavigate('catalogue', { eventId: featuredEvent.id })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E85002] text-[#F9F9F9] shadow-lg hover:bg-[#F16001] transition-colors"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {bentoSecondaryEvents.map((ev) => {
            const isFav = favoriteEventIds.includes(ev.id);
            return (
              <div
                key={ev.id}
                className="group relative min-h-[200px] overflow-hidden rounded-3xl porcelain-card"
              >
                {ev.imageUrl && (
                  <img
                    src={ev.imageUrl}
                    alt={ev.title}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/15" />
                <div className="relative flex h-full flex-col justify-between p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-[#F9F9F9] backdrop-blur-md">
                      {ev.city} · {translateSector(ev.sector, lang)}
                    </span>
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
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                        isFav ? 'bg-[#E85002] text-[#F9F9F9]' : 'bg-black/55 text-[#F9F9F9] hover:bg-[#E85002]'
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${isFav ? 'fill-white text-white' : ''}`} />
                    </button>
                  </div>
                  <div className="mt-16 flex items-end justify-between gap-2">
                    <h3 className="text-base font-bold text-[#F9F9F9] leading-snug">{ev.title}</h3>
                    <button
                      type="button"
                      aria-label={isEn ? `Open ${ev.title}` : `Ouvrir ${ev.title}`}
                      onClick={() => onNavigate('catalogue', { eventId: ev.id })}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E85002] text-[#F9F9F9] shadow-lg hover:bg-[#F16001] transition-colors"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 4: Recommended Events Powered by Python Matchmaking Engine */}
      {recommendations.length > 0 && (
        <section aria-labelledby="home-recommended-heading" className="porcelain-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="home-recommended-heading"
                className="text-base sm:text-lg font-bold text-[#000000] dark:text-[#F9F9F9]"
              >
                {t.recommendedTitle}
              </h2>
              <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">{t.recommendedSub}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('catalogue')}
              className="text-xs font-semibold text-[#E85002] hover:text-[#F16001] inline-flex items-center gap-1"
            >
              <span>{lang === 'en' ? 'Explore catalog' : 'Explorer'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-3.5 md:grid-cols-3">
            {recommendations.map((rec) => {
              const avail = getEventAvailabilityStatus({
                capacity: rec.capacity,
                registeredCount: rec.registeredCount,
              });
              const dotClass =
                avail.status === 'full'
                  ? 'bg-[#C10801]'
                  : avail.status === 'limited'
                    ? 'bg-[#F16001]'
                    : 'bg-emerald-500';
              return (
                <button
                  key={rec.eventId}
                  type="button"
                  onClick={() => onNavigate('catalogue', { eventId: rec.eventId })}
                  className="group rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E85002] flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#E85002] truncate">
                        {translateSector(rec.sector, lang)} · {rec.city}
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-[#646464] dark:text-[#A7A7A7] shrink-0">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                        <span className="font-mono tabular-nums">
                          {rec.remainingSeats} {isEn ? 'seats' : 'places'}
                        </span>
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] leading-snug line-clamp-2 group-hover:text-[#E85002]">
                      {rec.title}
                    </h3>
                    <p className="text-xs text-[#646464] dark:text-[#A7A7A7] truncate">{rec.reason}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--ae-border)] pt-2.5 text-[11px]">
                    <span className="font-mono tabular-nums text-[#646464] dark:text-[#A7A7A7]">
                      {new Date(rec.dateIso).toLocaleDateString(dateLocale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[#000000] dark:text-[#F9F9F9] group-hover:text-[#E85002]">
                      <span>{rec.locked ? (isEn ? 'Preview' : 'Aperçu') : isEn ? 'Open' : 'Ouvrir'}</span>
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Row 5: Tendances de réseautage (Recharts 30-day interactive area chart) */}
      <NetworkingTrendsCard
        userId={user?.id}
        lang={lang}
        registrations={registrations}
        connections={connections}
        scannedBadges={scannedBadges}
        darkMode={darkMode}
      />

      {/* Row 6: Image 2 "Popular Teams" Dirigeants & Réseaux + Image 3 "Recent Activity" Agenda */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 5 cols: Popular Teams / Dirigeants & Clés E2EE (Image 2 bottom style) */}
        <div className="lg:col-span-5 porcelain-card rounded-3xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Top Founders & Execs' : 'Dirigeants populaires'}
              </h3>
              <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                {isEn ? 'Verified networks & E2EE keys' : 'Réseaux vérifiés & clés E2EE'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(isSubscriber ? 'directory' : 'subscription')}
              className="text-xs font-semibold text-[#E85002] hover:text-[#F16001]"
            >
              {isEn ? 'Directory' : 'Annuaire'}
            </button>
          </div>

          <div className="space-y-2.5">
            {FEATURED_CONTACTS.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={c.avatar}
                    alt={c.name}
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-[#E85002]/60 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{c.name}</p>
                    <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] truncate">
                      {isEn ? c.roleEn : c.roleFr}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(isSubscriber ? 'directory' : 'subscription')}
                  className="shrink-0 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#26262B] px-3 py-1.5 text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9] hover:bg-[#E85002] hover:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                >
                  {isEn ? 'View card' : 'Voir fiche'}
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate(isSubscriber ? 'messages' : 'subscription')}
            className="w-full min-h-[46px] flex items-center justify-between rounded-full orange-glow-btn px-2 py-1.5 text-xs font-bold transition-all"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-[#F9F9F9]">
              <MessageSquare className="h-4 w-4" />
            </span>
            <span>
              {isSubscriber
                ? isEn
                  ? 'Open E2EE Messaging'
                  : 'Ouvrir la messagerie E2EE'
                : isEn
                  ? 'Unlock networking'
                  : 'Débloquer la mise en relation'}
            </span>
            <span className="pr-3 font-mono text-[#D9C3AB]">&gt;&gt;&gt;</span>
          </button>
        </div>

        {/* Right 7 cols: Image 3 "Recent Activity" Agenda & Événements récents */}
        <div className="lg:col-span-7 porcelain-card rounded-3xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Recent Events' : 'Événements récents'}
              </h3>
              <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                {agendaEvents.length} {isEn ? 'selected session(s)' : 'session(s) sélectionnée(s)'}
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-[#E85002]">{isEn ? 'Schedule' : 'Agenda'}</span>
          </div>

          <div className="space-y-2.5">
            {agendaEvents.map((ev) => {
              const isFav = favoriteEventIds.includes(ev.id);
              return (
                <div
                  key={ev.id}
                  className="flex w-full items-center gap-2 rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] p-2.5 hover:ring-1 hover:ring-[#E85002]/60 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => onNavigate('catalogue', { eventId: ev.id })}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white dark:bg-[#121214] border border-[var(--ae-border)] font-mono">
                      <span className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
                        {new Date(ev.dateIso).toLocaleDateString(dateLocale, { day: '2-digit' })}
                      </span>
                      <span className="text-[9px] uppercase text-[#E85002] font-bold">
                        {new Date(ev.dateIso).toLocaleDateString(dateLocale, { month: 'short' })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{ev.title}</p>
                      <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] truncate">
                        {ev.city} · {translateSector(ev.sector, lang)}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-[#646464] dark:text-[#A7A7A7] shrink-0">
                      {formatEventModeLabel(ev.format, lang)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(ev.id)}
                    aria-pressed={isFav}
                    aria-label={
                      isFav
                        ? isEn
                          ? `Remove ${ev.title} from favorites (schedule)`
                          : `Retirer ${ev.title} des favoris (agenda)`
                        : isEn
                          ? `Add ${ev.title} to favorites (schedule)`
                          : `Ajouter ${ev.title} aux favoris (agenda)`
                    }
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isFav
                        ? 'border-[#E85002] bg-[#E85002]/15 text-[#E85002]'
                        : 'border-[var(--ae-border)] bg-white dark:bg-[#121214] text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002]'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${isFav ? 'fill-[#E85002] text-[#E85002]' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('catalogue')}
            className="w-full min-h-[44px] rounded-full orange-glow-btn text-xs font-bold transition-all"
          >
            {isEn ? 'View all in catalog' : 'Tout voir dans le catalogue'}
          </button>
        </div>
      </div>

      {/* Dedicated Favorite Events + 30-min Push Reminder Control */}
      <section aria-labelledby="home-favorites-heading" className="porcelain-card rounded-3xl p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E85002]/15 text-[#E85002]">
              <Heart className={`h-4 w-4 ${favoriteEvents.length > 0 ? 'fill-[#E85002]' : ''}`} />
            </span>
            <h2 id="home-favorites-heading" className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
              {t.myFavoritesTitle}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-semibold text-[#646464] dark:text-[#A7A7A7] tabular-nums">
              {favoriteEvents.length} {isEn ? 'saved' : 'enregistré(s)'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('catalogue')}
              className="text-xs font-semibold text-[#E85002] hover:text-[#F16001]"
            >
              {t.navCatalogue}
            </button>
          </div>
        </div>

        {/* 30-Minute Local Push Reminder Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E85002] text-[#F9F9F9]">
              {favoriteReminderEnabled && notifPermission === 'granted' ? (
                <BellRing className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{t.reminder30mTitle}</p>
              <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] truncate">
                {notifPermission === 'denied'
                  ? t.reminderPermissionDenied
                  : favoriteReminderEnabled && notifPermission === 'granted'
                    ? t.reminderActiveLabel
                    : t.reminder30mDesc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {notifPermission !== 'granted' && notifPermission !== 'unsupported' && notifPermission !== 'denied' && (
              <button
                type="button"
                onClick={() => onEnableFavoriteReminders?.()}
                className="min-h-[36px] rounded-full orange-glow-btn px-3.5 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                {t.reminderEnableBtn}
              </button>
            )}
            <button
              type="button"
              onClick={handleTestReminderClick}
              className="min-h-[36px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#121214] px-3.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors whitespace-nowrap"
            >
              {t.reminderTestBtn}
            </button>
          </div>
        </div>

        {favoriteEvents.length === 0 ? (
          <p className="rounded-2xl bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-4 py-3 text-xs text-[#646464] dark:text-[#A7A7A7]">
            {t.noFavoritesText}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteEvents.map((ev) => (
              <div
                key={ev.id}
                className="ice-panel rounded-2xl p-4 flex items-start justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => onNavigate('catalogue', { eventId: ev.id })}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-xs font-semibold text-[#E85002]">
                    {ev.city}, {translateCountry(ev.country, lang)} · {translateSector(ev.sector, lang)}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-[#000000] dark:text-[#F9F9F9] line-clamp-1">
                    {ev.title}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-[#646464] dark:text-[#A7A7A7]">
                    <span>
                      {new Date(ev.dateIso).toLocaleDateString(dateLocale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    {favoriteReminderEnabled && (
                      <span className="inline-flex items-center gap-1 font-sans font-semibold text-[#000000] dark:text-[#D9C3AB]">
                        · <Bell className="h-3 w-3 text-[#E85002]" /> {t.reminderBadgeLabel}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(ev.id)}
                  aria-pressed="true"
                  aria-label={`Retirer ${ev.title} de mes favoris`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E85002]/15 text-[#E85002] border border-[#E85002]/30 hover:bg-[#E85002] hover:text-[#F9F9F9] transition-colors"
                >
                  <Heart className="h-4 w-4 fill-current" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirmed Registrations Strip */}
      {isSubscriber && registrations.length > 0 && (
        <section className="porcelain-card rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">{t.myRegistrationsTitle}</h2>
            <span className="font-mono text-xs font-semibold text-[#E85002] tabular-nums">
              {registrations.length} {isEn ? 'confirmed' : 'confirmée(s)'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {registrations.map((reg) => {
              const ev = events.find((e) => e.id === reg.eventId);
              if (!ev) return null;
              return (
                <button
                  key={reg.id}
                  type="button"
                  onClick={() => onNavigate('catalogue', { eventId: ev.id })}
                  className="ice-panel rounded-2xl p-4 text-left hover:border-[#E85002] transition-colors flex flex-col justify-between gap-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#E85002]">
                      {ev.city}, {translateCountry(ev.country, lang)} · {reg.sessionSlot || (isEn ? 'Plenary' : 'Plénière')}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-[#000000] dark:text-[#F9F9F9] line-clamp-1">
                      {ev.title}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--ae-border)] text-[11px]">
                    <span className="font-mono font-bold text-[#F9F9F9] bg-[#E85002] px-2.5 py-0.5 rounded-full">
                      {reg.confirmationCode}
                    </span>
                    <span className="text-[#646464] dark:text-[#A7A7A7] font-medium">
                      {new Date(ev.dateIso).toLocaleDateString(dateLocale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
