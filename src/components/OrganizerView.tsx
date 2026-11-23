import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  Download,
  Edit3,
  Search,
  ShieldAlert,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import { localeForLang, translateCountry, translateSector, type AppLanguage } from '../lib/i18n';
import { computeOrganizerMetrics, verifyTicketCodeMatch } from '../lib/workspaceInsights';
import type {
  BusinessEvent,
  EventFormat,
  EventParticipantSummary,
  MemberAccount,
} from '../types/domain';

interface OrganizerViewProps {
  user: MemberAccount | null;
  lang?: AppLanguage;
  onRefreshApp: () => Promise<void>;
}

export const OrganizerView: React.FC<OrganizerViewProps> = ({ user, lang = 'fr', onRefreshApp }) => {
  const isEn = lang === 'en';
  const dateLocale = localeForLang(lang);
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantStatusFilter, setParticipantStatusFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [ticketCheckQuery, setTicketCheckQuery] = useState('');
  const [ticketCheckResult, setTicketCheckResult] = useState<{
    checkedCode: string;
    match: EventParticipantSummary | null;
  } | null>(null);
  const [pythonInsights, setPythonInsights] = useState<{
    fillRatePct: number;
    estimatedTicketRevenueEur: number;
    engine?: string;
  } | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create / Edit event form fields
  const [title, setTitle] = useState('');
  const [country, setCountry] = useState('Côte d’Ivoire');
  const [city, setCity] = useState('Abidjan');
  const [sector, setSector] = useState('Agro-industrie');
  const [format, setFormat] = useState<EventFormat>('hybrid');
  const [dateInput, setDateInput] = useState('2027-02-15');
  const [capacity, setCapacity] = useState(120);
  const [feeEur, setFeeEur] = useState(0);
  const [venueAddress, setVenueAddress] = useState('');
  const [virtualLink, setVirtualLink] = useState('');
  const [publicSummary, setPublicSummary] = useState('');
  const [fullDescription, setFullDescription] = useState('');

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canAccess = user && (user.role === 'organizer' || user.role === 'admin');

  const loadOrganizerEvents = async () => {
    if (!canAccess) return;
    try {
      const res = await apiFetch<{ events: BusinessEvent[] }>('/api/organizer/events');
      setEvents(res.events);
      if (res.events.length > 0 && !selectedEventId) {
        setSelectedEventId(res.events[0].id);
      }
      apiFetch<{ fillRatePct: number; estimatedTicketRevenueEur: number; engine?: string }>(
        '/api/analytics/workspace-insights'
      )
        .then((ins) => setPythonInsights(ins))
        .catch(() => {});
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : isEn ? 'Failed to load organizer events.' : 'Erreur chargement événements organisateur.',
      });
    }
  };

  useEffect(() => {
    if (canAccess) {
      loadOrganizerEvents();
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    setTicketCheckResult(null);
    if (!canAccess || !selectedEventId) {
      setParticipants([]);
      return;
    }
    apiFetch<{ participants: EventParticipantSummary[] }>(
      `/api/organizer/events/${selectedEventId}/participants`
    )
      .then((res) => setParticipants(res.participants))
      .catch(() => setParticipants([]));
  }, [selectedEventId, canAccess]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const organizerMetrics = useMemo(() => computeOrganizerMetrics(events), [events]);

  const filteredParticipants = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    return participants.filter((p) => {
      if (participantStatusFilter !== 'all' && p.status !== participantStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.confirmationCode.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        (p.sessionSlot || '').toLowerCase().includes(q)
      );
    });
  }, [participants, participantSearch, participantStatusFilter]);

  const resetForm = () => {
    setEditingEventId(null);
    setTitle('');
    setCountry('Côte d’Ivoire');
    setCity('Abidjan');
    setSector('Agro-industrie');
    setFormat('hybrid');
    setDateInput('2027-02-15');
    setCapacity(120);
    setFeeEur(0);
    setVenueAddress('');
    setVirtualLink('');
    setPublicSummary('');
    setFullDescription('');
  };

  const openEditEvent = (ev: BusinessEvent) => {
    setEditingEventId(ev.id);
    setShowCreateForm(true);
    setTitle(ev.title);
    setCountry(ev.country);
    setCity(ev.city);
    setSector(ev.sector);
    setFormat(ev.format);
    setDateInput(ev.dateIso.slice(0, 10));
    setCapacity(ev.capacity);
    setFeeEur(ev.feeEur);
    setVenueAddress(ev.venueAddress);
    setVirtualLink(ev.virtualLink);
    setPublicSummary(ev.publicSummary);
    setFullDescription(ev.fullDescription);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = {
        title,
        country,
        city,
        sector,
        format,
        dateIso: new Date(`${dateInput}T09:00:00.000Z`).toISOString(),
        capacity,
        feeEur,
        venueAddress: venueAddress || `${city}, ${country}`,
        virtualLink,
        publicSummary:
          publicSummary ||
          (isEn ? `${sector} session in ${city}.` : `Session ${sector} à ${city}.`),
        fullDescription:
          fullDescription ||
          publicSummary ||
          (isEn ? `Full ${sector} program in ${city}.` : `Programme complet ${sector} à ${city}.`),
      };
      if (editingEventId) {
        await apiFetch(`/api/organizer/events/${editingEventId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback({ type: 'ok', text: isEn ? 'Event updated.' : 'Événement mis à jour.' });
      } else {
        const res = await apiFetch<{ event: BusinessEvent }>('/api/organizer/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSelectedEventId(res.event.id);
        setFeedback({
          type: 'ok',
          text: isEn ? 'New event published to catalog.' : 'Nouvel événement publié dans le catalogue.',
        });
      }
      setShowCreateForm(false);
      resetForm();
      await loadOrganizerEvents();
      await onRefreshApp();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : isEn ? 'Unable to save event.' : 'Enregistrement impossible.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    if (!selectedEvent || participants.length === 0) return;
    const header = isEn
      ? ['Name', 'Email', 'City', 'Country', 'Session', 'Code', 'Status']
      : ['Nom', 'Courriel', 'Ville', 'Pays', 'Session', 'Code', 'Statut'];
    const rows = participants.map((p) => [
      p.fullName,
      p.email,
      p.city,
      p.country,
      p.sessionSlot || (isEn ? 'Plenary' : 'Plénière'),
      p.confirmationCode,
      p.status,
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants-${selectedEvent.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canAccess) {
    return (
      <div className="porcelain-card rounded-3xl p-8 text-center max-w-lg mx-auto my-8">
        <ShieldAlert className="mx-auto h-8 w-8 text-[#C10801] dark:text-[#F16001]" />
        <h1 className="mt-3 text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
          {isEn ? 'Organizer Workspace Restricted' : 'Espace Organisateur réservé'}
        </h1>
        <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
          {isEn
            ? 'Sign in with an Organizer or Administrator account to manage your events and attendees.'
            : 'Connectez-vous avec un compte Organisateur ou Administrateur pour gérer vos événements et participants.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#000000] dark:text-[#F9F9F9]">
            {isEn ? 'Organizer Workspace' : 'Espace Organisateur'}
          </h1>
          <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
            {isEn
              ? 'Create events, monitor available capacity, and verify attendee registration codes.'
              : 'Créez vos événements, suivez les places disponibles et contrôlez les codes d’inscription des participants.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowCreateForm((v) => !v);
          }}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-full orange-glow-btn px-5 text-xs font-semibold transition-all self-start whitespace-nowrap"
        >
          <CalendarPlus className="h-4 w-4" />
          <span>
            {showCreateForm
              ? isEn
                ? 'Close form'
                : 'Fermer le formulaire'
              : isEn
                ? 'New event'
                : 'Nouvel événement'}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="porcelain-card rounded-2xl p-4">
          <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
            {isEn ? 'Published events' : 'Événements publiés'}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
            {organizerMetrics.publishedCount}
            <span className="text-xs font-normal text-[#646464] dark:text-[#A7A7A7]"> / {organizerMetrics.totalEvents}</span>
          </p>
        </div>
        <div className="porcelain-card rounded-2xl p-4">
          <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
            {isEn ? 'Registered / Capacity' : 'Inscrits / Capacité'}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
            {organizerMetrics.totalRegistered}
            <span className="text-xs font-normal text-[#646464] dark:text-[#A7A7A7]"> / {organizerMetrics.totalCapacity}</span>
          </p>
        </div>
        <div className="ice-panel rounded-2xl p-4">
          <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
            {isEn ? 'Fill rate' : 'Taux de remplissage'}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#E85002] tabular-nums">
            {pythonInsights?.fillRatePct ?? organizerMetrics.fillRatePct}%
          </p>
        </div>
        <div className="navy-card rounded-2xl p-4">
          <p className="text-[11px] font-medium text-[#D9C3AB]">
            {isEn ? 'Estimated ticketing' : 'Billetterie estimée'}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#F9F9F9] tabular-nums">
            {pythonInsights?.estimatedTicketRevenueEur ?? organizerMetrics.estimatedRevenueEur} €
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
              : 'border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleSaveEvent} className="porcelain-card rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
              {editingEventId
                ? isEn
                  ? 'Edit event'
                  : 'Modifier l’événement'
                : isEn
                  ? 'Publish an event'
                  : 'Publier un événement'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                resetForm();
              }}
              aria-label={isEn ? 'Close event form' : 'Fermer le formulaire événement'}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-[#646464] dark:text-[#A7A7A7] hover:bg-[#F3EFEA] dark:hover:bg-[#1A1A1D] hover:text-[#000000] dark:hover:text-[#F9F9F9]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="org-title" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Event title' : 'Titre de l’événement'}
              </label>
              <input
                id="org-title"
                required
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isEn ? 'e.g., Abidjan Agri-Processing Forum' : 'Ex: Forum Agro-Transformation Abidjan'}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="org-country" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Country' : 'Pays'}
              </label>
              <input
                id="org-country"
                required
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="org-city" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'City' : 'Ville'}
              </label>
              <input
                id="org-city"
                required
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="org-sector" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Sector' : 'Secteur'}
              </label>
              <input
                id="org-sector"
                required
                type="text"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="org-format" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Format' : 'Format'}
              </label>
              <select
                id="org-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as EventFormat)}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
              >
                <option value="in_person">{isEn ? 'In-Person' : 'Présentiel'}</option>
                <option value="hybrid">{isEn ? 'Hybrid' : 'Hybride'}</option>
                <option value="virtual">{isEn ? 'Online' : 'En ligne'}</option>
              </select>
            </div>

            <div>
              <label htmlFor="org-date" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Date' : 'Date'}
              </label>
              <input
                id="org-date"
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="org-cap" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Capacity' : 'Capacité'}
                </label>
                <input
                  id="org-cap"
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="org-fee" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Fee (€)' : 'Frais (€)'}
                </label>
                <input
                  id="org-fee"
                  type="number"
                  min={0}
                  value={feeEur}
                  onChange={(e) => setFeeEur(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="org-venue" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Physical address (subscribers only)' : 'Adresse physique (réservée abonnés)'}
              </label>
              <input
                id="org-venue"
                type="text"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                placeholder={isEn ? 'e.g., Plateau Business Center, Abidjan' : 'Ex: Plateau Business Center, Abidjan'}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="org-link" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Video link (optional)' : 'Lien visio (optionnel)'}
              </label>
              <input
                id="org-link"
                type="url"
                value={virtualLink}
                onChange={(e) => setVirtualLink(e.target.value)}
                placeholder="https://meet.africaentrepreneur.com/..."
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="org-summary" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn
                  ? 'Public summary (visible to Personal & Visitors)'
                  : 'Aperçu public (visible aux Personnel & Visiteurs)'}
              </label>
              <input
                id="org-summary"
                type="text"
                value={publicSummary}
                onChange={(e) => setPublicSummary(e.target.value)}
                placeholder={isEn ? 'Short overview visible before subscribing...' : 'Résumé court visible avant abonnement...'}
                className="w-full min-h-[44px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="org-desc" className="block text-xs font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                {isEn ? 'Full program (subscribers only)' : 'Programme complet (réservé aux abonnés)'}
              </label>
              <textarea
                id="org-desc"
                rows={3}
                value={fullDescription}
                onChange={(e) => setFullDescription(e.target.value)}
                className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="min-h-[46px] rounded-full orange-glow-btn px-6 text-xs font-semibold disabled:opacity-60"
          >
            {busy
              ? isEn
                ? 'Saving...'
                : 'Enregistrement...'
              : editingEventId
                ? isEn
                  ? 'Update event'
                  : 'Mettre à jour'
                : isEn
                  ? 'Publish event'
                  : 'Publier l’événement'}
          </button>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Organizer Events List */}
        <div className="lg:col-span-5 min-w-0 space-y-3">
          {events.length === 0 ? (
            <div className="porcelain-card rounded-3xl p-6 text-center text-sm text-[#646464] dark:text-[#A7A7A7]">
              {isEn ? 'No events linked to your account yet.' : 'Aucun événement rattaché à votre compte pour le moment.'}
            </div>
          ) : (
            events.map((ev) => {
              const active = ev.id === selectedEventId;
              return (
                <div
                  key={ev.id}
                  className={`rounded-3xl p-5 border transition-all space-y-3 ${
                    active
                      ? 'navy-card text-[#F9F9F9] border-[#E85002]/40'
                      : 'porcelain-card text-[#000000] dark:text-[#F9F9F9] border-[var(--ae-border)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${active ? 'text-[#D9C3AB]' : 'text-[#E85002]'}`}>
                        {ev.city}, {translateCountry(ev.country, lang)} · {translateSector(ev.sector, lang)}
                      </p>
                      <h2 className={`mt-1 text-base font-bold ${active ? 'text-[#F9F9F9]' : 'text-[#000000] dark:text-[#F9F9F9]'}`}>
                        {ev.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditEvent(ev)}
                      aria-label={isEn ? `Edit ${ev.title}` : `Modifier ${ev.title}`}
                      className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full shrink-0 transition-colors ${
                        active
                          ? 'bg-white/10 text-[#F9F9F9] hover:bg-[#E85002]'
                          : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]'
                      }`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className={`h-1.5 w-full rounded-full overflow-hidden ${active ? 'bg-white/15' : 'bg-[#F3EFEA] dark:bg-[#1E1E22]'}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#E85002] to-[#F16001]"
                        style={{
                          width: `${ev.capacity > 0 ? Math.min(100, Math.round((ev.registeredCount / ev.capacity) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-current/10 text-xs">
                    <span className={`font-mono tabular-nums ${active ? 'text-[#D9C3AB]' : 'text-[#646464] dark:text-[#A7A7A7]'}`}>
                      {ev.registeredCount}/{ev.capacity} {isEn ? 'registered' : 'inscrits'} ·{' '}
                      {ev.status === 'published'
                        ? isEn
                          ? 'Published'
                          : 'Publié'
                        : ev.status === 'draft'
                          ? isEn
                            ? 'Draft'
                            : 'Brouillon'
                          : ev.status === 'suspended'
                            ? isEn
                              ? 'Suspended'
                              : 'Suspendu'
                            : isEn
                              ? 'Archived'
                              : 'Archivé'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(ev.id)}
                      className={`min-h-[34px] rounded-full px-3.5 font-semibold whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-[#E85002] text-[#F9F9F9] hover:bg-[#F16001]'
                          : 'orange-glow-btn'
                      }`}
                    >
                      {isEn ? 'Attendees' : 'Participants'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Registered Participants & Code Verification */}
        <div className="lg:col-span-7 min-w-0 porcelain-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#E85002]" />
                <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn
                    ? `Registered attendees (${filteredParticipants.length})`
                    : `Participants inscrits (${filteredParticipants.length})`}
                </h2>
              </div>
              {selectedEvent && (
                <p className="text-xs text-[#646464] dark:text-[#A7A7A7] mt-0.5">{selectedEvent.title}</p>
              )}
            </div>

            {participants.length > 0 && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-[#E85002]" />
                <span>{isEn ? 'Export CSV' : 'Exporter CSV'}</span>
              </button>
            )}
          </div>

          {/* Instant On-Site Ticket Check-in Code Verifier */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!ticketCheckQuery.trim()) return;
              const match = verifyTicketCodeMatch(participants, ticketCheckQuery);
              setTicketCheckResult({ checkedCode: ticketCheckQuery.trim().toUpperCase(), match });
            }}
            className="ice-panel rounded-2xl p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] flex items-center">
                <Ticket className="pointer-events-none absolute left-3 h-4 w-4 text-[#E85002]" />
                <input
                  type="text"
                  aria-label={isEn ? 'Verify AE ticket code' : 'Contrôle code billet AE'}
                  value={ticketCheckQuery}
                  onChange={(e) => setTicketCheckQuery(e.target.value)}
                  placeholder={isEn ? 'Gate check-in: enter AE-... code' : 'Contrôle entrée : saisir code AE-...'}
                  className="w-full min-h-[38px] rounded-xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] pl-9 pr-3 font-mono text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="min-h-[38px] rounded-full orange-glow-btn px-4 text-xs font-semibold whitespace-nowrap"
              >
                {isEn ? 'Verify ticket' : 'Vérifier billet'}
              </button>
            </div>
            {ticketCheckResult && (
              <div
                className={`rounded-xl px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                  ticketCheckResult.match
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {ticketCheckResult.match ? (
                  <span>
                    {isEn ? 'Valid ticket:' : 'Billet valide :'}{' '}
                    <strong>{ticketCheckResult.match.fullName}</strong> (
                    {ticketCheckResult.match.sessionSlot || (isEn ? 'Plenary' : 'Plénière')}) ·{' '}
                    <span className="font-mono">{ticketCheckResult.match.confirmationCode}</span>
                  </span>
                ) : (
                  <span>
                    {isEn ? (
                      <>
                        No ticket found for <span className="font-mono">{ticketCheckResult.checkedCode}</span> on this event.
                      </>
                    ) : (
                      <>
                        Aucun billet trouvé pour <span className="font-mono">{ticketCheckResult.checkedCode}</span> sur cet événement.
                      </>
                    )}
                  </span>
                )}
              </div>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] flex items-center">
              <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#A7A7A7]" />
              <input
                type="text"
                aria-label={isEn ? 'Search attendee or ticket code' : 'Rechercher un participant ou code billet'}
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                placeholder={
                  isEn
                    ? 'Search by name, city, session, or AE-... code'
                    : 'Rechercher par nom, ville, session ou code AE-...'
                }
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-10 pr-4 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>

            <div className="ios-segmented inline-flex">
              {(
                [
                  { id: 'all', label: isEn ? 'All' : 'Tous' },
                  { id: 'confirmed', label: isEn ? 'Confirmed' : 'Confirmés' },
                  { id: 'cancelled', label: isEn ? 'Cancelled' : 'Annulés' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setParticipantStatusFilter(st.id)}
                  className={`min-h-[34px] rounded-full px-3 text-xs font-semibold transition-all ${
                    participantStatusFilter === st.id
                      ? 'bg-[#E85002] text-[#F9F9F9]'
                      : 'text-[#646464] dark:text-[#A7A7A7]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {filteredParticipants.length === 0 ? (
            <div className="ice-panel rounded-2xl p-6 text-center text-xs text-[#646464] dark:text-[#A7A7A7]">
              {isEn
                ? 'No confirmed attendees match this filter for this event.'
                : 'Aucun participant confirmé ne correspond à ce filtre pour cet événement.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--ae-border)]">
              {filteredParticipants.map((p) => (
                <div
                  key={p.registrationId}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{p.fullName}</p>
                    <p className="text-[#646464] dark:text-[#A7A7A7] truncate">
                      {p.email} · {p.city}, {translateCountry(p.country, lang)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="rounded-full bg-[#F3EFEA] dark:bg-[#1A1A1D] border border-[var(--ae-border)] px-3 py-1 font-medium text-[#000000] dark:text-[#F9F9F9]">
                      {p.sessionSlot || (isEn ? 'Plenary' : 'Plénière')}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#D9C3AB]/30 dark:bg-[#E85002]/15 border border-[#D9C3AB]/60 dark:border-[#E85002]/30 px-3 py-1 font-mono font-bold text-[#000000] dark:text-[#D9C3AB]">
                      <Ticket className="h-3 w-3 text-[#E85002]" />
                      <span>{p.confirmationCode}</span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        p.status === 'confirmed'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#646464] dark:text-[#A7A7A7]'
                      }`}
                    >
                      {p.status === 'confirmed' ? (isEn ? 'Confirmed' : 'Confirmé') : isEn ? 'Cancelled' : 'Annulé'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
