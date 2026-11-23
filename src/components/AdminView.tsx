import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarPlus,
  Check,
  Download,
  Edit3,
  Globe,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import {
  localeForLang,
  translateCountry,
  translateRole,
  translateSector,
  type AppLanguage,
} from '../lib/i18n';
import { computeAdminMetrics } from '../lib/workspaceInsights';
import type {
  AdminAuditLog,
  BusinessEvent,
  EnterprisePage,
  EventFormat,
  MemberAccount,
  ModerationReport,
  PaymentRecord,
  ProfessionalNetwork,
  SubscriptionEventLog,
  UserRole,
} from '../types/domain';

interface AdminOverview {
  members: MemberAccount[];
  enterprises: EnterprisePage[];
  events: BusinessEvent[];
  networks: ProfessionalNetwork[];
  payments: PaymentRecord[];
  subscriptionLogs: SubscriptionEventLog[];
  reports: ModerationReport[];
  auditLogs: AdminAuditLog[];
}

export const AdminView: React.FC<{
  user: MemberAccount | null;
  onRefreshApp: () => Promise<void>;
  lang?: AppLanguage;
}> = ({ user, onRefreshApp, lang = 'fr' }) => {
  const isEn = lang === 'en';
  const dateLocale = localeForLang(lang);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<'events' | 'networks' | 'members' | 'reports' | 'audit'>('events');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [evFilter, setEvFilter] = useState('');
  const [netFilter, setNetFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | UserRole>('all');

  // Create Event form
  const [evTitle, setEvTitle] = useState('');
  const [evCity, setEvCity] = useState('Abidjan');
  const [evCountry, setEvCountry] = useState('Côte d’Ivoire');
  const [evSector, setEvSector] = useState('Fintech');
  const [evFormat, setEvFormat] = useState<EventFormat>('hybrid');
  const [evSummary, setEvSummary] = useState('');
  const [evCapacity, setEvCapacity] = useState(100);
  const [evFee, setEvFee] = useState(0);

  // Edit Event modal state
  const [editingEvent, setEditingEvent] = useState<BusinessEvent | null>(null);

  // Create Network form
  const [netName, setNetName] = useState('');
  const [netCountries, setNetCountries] = useState('Sénégal, France');
  const [netSectors, setNetSectors] = useState('Fintech, Export');
  const [netEmail, setNetEmail] = useState('reseau@africaentrepreneur.com');
  const [netSummary, setNetSummary] = useState('');
  const [netFullDesc, setNetFullDesc] = useState('');

  // Edit Network modal state
  const [editingNet, setEditingNet] = useState<ProfessionalNetwork | null>(null);

  const loadOverview = async () => {
    try {
      const res = await apiFetch<AdminOverview>('/api/admin/overview');
      setData(res);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Administration access denied.'
            : 'Accès administration refusé.'
      );
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadOverview();
    }
  }, [user]);

  const adminMetrics = useMemo(
    () =>
      data
        ? computeAdminMetrics({
            members: data.members,
            enterprises: data.enterprises,
            events: data.events,
            payments: data.payments,
            reports: data.reports,
          })
        : null,
    [data]
  );

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    const q = evFilter.trim().toLowerCase();
    if (!q) return data.events;
    return data.events.filter(
      (ev) =>
        ev.title.toLowerCase().includes(q) ||
        ev.city.toLowerCase().includes(q) ||
        ev.sector.toLowerCase().includes(q)
    );
  }, [data, evFilter]);

  const filteredNetworks = useMemo(() => {
    if (!data) return [];
    const q = netFilter.trim().toLowerCase();
    if (!q) return data.networks;
    return data.networks.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.countries.join(',').toLowerCase().includes(q) ||
        n.sectors.join(',').toLowerCase().includes(q)
    );
  }, [data, netFilter]);

  const filteredMembers = useMemo(() => {
    if (!data) return [];
    const q = memberFilter.trim().toLowerCase();
    return data.members.filter((m) => {
      if (memberRoleFilter !== 'all' && m.role !== memberRoleFilter) return false;
      if (!q) return true;
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.city.toLowerCase().includes(q) ||
        m.country.toLowerCase().includes(q)
      );
    });
  }, [data, memberFilter, memberRoleFilter]);

  const handleExportAuditCsv = () => {
    if (!data) return;
    const header = isEn
      ? ['Date', 'Actor', 'Action', 'Target', 'Details']
      : ['Date', 'Acteur', 'Action', 'Cible', 'Détails'];
    const rows = data.auditLogs.map((l) => [l.createdAt, l.actorEmail, l.action, l.target, l.details]);
    const csv = [header, ...rows]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-africa-entrepreneur.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="porcelain-card rounded-3xl p-8 text-center max-w-lg mx-auto my-8">
        <ShieldAlert className="mx-auto h-8 w-8 text-[#C10801] dark:text-[#F16001]" />
        <h1 className="mt-3 text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
          {isEn ? 'Administrator access required' : 'Accès administrateur requis'}
        </h1>
        <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
          {isEn
            ? 'This interface is protected server-side by a distinct role.'
            : 'Cette interface est protégée côté serveur par rôle distinct.'}
        </p>
      </div>
    );
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evTitle.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/api/admin/events', {
        method: 'POST',
        body: JSON.stringify({
          title: evTitle,
          city: evCity,
          country: evCountry,
          sector: evSector,
          format: evFormat,
          publicSummary:
            evSummary ||
            (isEn ? `${evSector} business meetup in ${evCity}` : `Rencontre entrepreneuriale ${evSector} à ${evCity}`),
          fullDescription:
            evSummary ||
            (isEn ? `Full ${evSector} session in ${evCity}` : `Session complète ${evSector} à ${evCity}`),
          capacity: evCapacity,
          feeEur: evFee,
        }),
      });
      setEvTitle('');
      setEvSummary('');
      await loadOverview();
      await onRefreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Creation failed.' : 'Création échouée.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEventEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/events/${editingEvent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editingEvent.title,
          country: editingEvent.country,
          city: editingEvent.city,
          sector: editingEvent.sector,
          format: editingEvent.format,
          capacity: Number(editingEvent.capacity),
          feeEur: Number(editingEvent.feeEur),
          publicSummary: editingEvent.publicSummary,
          fullDescription: editingEvent.fullDescription,
        }),
      });
      setEditingEvent(null);
      await loadOverview();
      await onRefreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Update failed.' : 'Mise à jour impossible.');
    } finally {
      setBusy(false);
    }
  };

  const handleEventStatus = async (eventId: string, status: BusinessEvent['status']) => {
    await apiFetch(`/api/admin/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadOverview();
    await onRefreshApp();
  };

  const handleCreateNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!netName.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/api/admin/networks', {
        method: 'POST',
        body: JSON.stringify({
          name: netName.trim(),
          countries: netCountries
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          sectors: netSectors
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          contactEmail: netEmail.trim(),
          publicSummary: netSummary.trim(),
          fullDescription: netFullDesc.trim() || netSummary.trim(),
        }),
      });
      setNetName('');
      setNetSummary('');
      setNetFullDesc('');
      await loadOverview();
      await onRefreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Network creation failed.' : 'Création réseau échouée.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNetworkEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNet) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/networks/${editingNet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingNet.name,
          publicSummary: editingNet.publicSummary,
          fullDescription: editingNet.fullDescription,
          contactEmail: editingNet.contactEmail,
          countries: editingNet.countries,
          sectors: editingNet.sectors,
        }),
      });
      setEditingNet(null);
      await loadOverview();
      await onRefreshApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Network update failed.' : 'Mise à jour réseau impossible.');
    } finally {
      setBusy(false);
    }
  };

  const handleNetworkStatus = async (networkId: string, status: ProfessionalNetwork['status']) => {
    await apiFetch(`/api/admin/networks/${networkId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadOverview();
    await onRefreshApp();
  };

  const handleToggleSuspendMember = async (memberId: string, suspended: boolean) => {
    await apiFetch(`/api/admin/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ suspended }),
    });
    await loadOverview();
  };

  const handleRoleChange = async (memberId: string, role: UserRole) => {
    await apiFetch(`/api/admin/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    await loadOverview();
  };

  const handleVerifyEnterprise = async (enterpriseId: string, verified: boolean) => {
    await apiFetch(`/api/admin/enterprises/${enterpriseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ verified }),
    });
    await loadOverview();
    await onRefreshApp();
  };

  const handleResolveReport = async (reportId: string, suspendTargetMember: boolean) => {
    await apiFetch(`/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'resolved',
        resolutionNote: suspendTargetMember ? 'Compte suspendu suite à vérification' : 'Signalement traité',
        suspendTargetMember,
      }),
    });
    await loadOverview();
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#000000] dark:text-[#F9F9F9]">
            {isEn ? 'Administration & Moderation' : 'Administration & Modération'}
          </h1>
          <p className="mt-1 text-sm text-[#646464] dark:text-[#A7A7A7]">
            {isEn
              ? 'Manage content, networks, members, verified companies, reports, and audit trails.'
              : 'Gestion des contenus, réseaux, membres, entreprises vérifiées, signalements et audit.'}
          </p>
        </div>

        <div className="inline-flex flex-wrap sm:flex-nowrap items-center gap-0.5 rounded-2xl sm:rounded-full ios-segmented border border-[var(--ae-border)] self-start 2xl:self-auto shrink-0">
          {[
            { id: 'events' as const, label: isEn ? 'Events' : 'Événements' },
            { id: 'networks' as const, label: isEn ? 'Networks' : 'Réseaux' },
            { id: 'members' as const, label: isEn ? 'Members' : 'Membres' },
            { id: 'reports' as const, label: isEn ? 'Reports' : 'Signalements' },
            { id: 'audit' as const, label: isEn ? 'Payments & Audit' : 'Paiements & Audit' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[38px] rounded-full px-3.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'bg-[#E85002] text-[#F9F9F9] shadow-sm'
                  : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {adminMetrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="navy-card rounded-2xl p-4">
            <p className="text-[11px] font-medium text-[#D9C3AB]">
              {isEn ? 'Subscription revenue' : 'Revenus abonnements'}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#F9F9F9] tabular-nums">
              {adminMetrics.totalRevenueEur} €
            </p>
          </div>
          <div className="porcelain-card rounded-2xl p-4">
            <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
              {isEn ? 'Active subscribers' : 'Abonnés actifs'}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
              {adminMetrics.activeSubscribersCount}
              <span className="text-xs font-normal text-[#646464] dark:text-[#A7A7A7]"> / {data?.members.length ?? 0}</span>
            </p>
          </div>
          <div className="porcelain-card rounded-2xl p-4">
            <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
              {isEn ? 'Verified companies' : 'Entreprises vérifiées'}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#000000] dark:text-[#F9F9F9] tabular-nums">
              {adminMetrics.verifiedEnterprisesCount}
              <span className="text-xs font-normal text-[#646464] dark:text-[#A7A7A7]"> / {adminMetrics.totalEnterprisesCount}</span>
            </p>
          </div>
          <div className="ice-panel rounded-2xl p-4">
            <p className="text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7]">
              {isEn ? 'Open reports' : 'Signalements ouverts'}
            </p>
            <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${adminMetrics.openReportsCount > 0 ? 'text-[#C10801] dark:text-[#F16001]' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {adminMetrics.openReportsCount}
            </p>
          </div>
        </div>
      )}

      {/* TAB 1: Events */}
      {data && tab === 'events' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleCreateEvent}
            className="lg:col-span-5 porcelain-card rounded-3xl p-5 space-y-3.5"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
              <CalendarPlus className="h-4 w-4 text-[#E85002]" />
              <span>{isEn ? 'Publish a new event' : 'Publier un nouvel événement'}</span>
            </div>
            <input
              type="text"
              required
              aria-label={isEn ? 'Event title' : 'Titre de l’événement'}
              value={evTitle}
              onChange={(e) => setEvTitle(e.target.value)}
              placeholder={isEn ? 'Event title' : 'Titre de l’événement'}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                aria-label={isEn ? 'Country' : 'Pays'}
                value={evCountry}
                onChange={(e) => setEvCountry(e.target.value)}
                placeholder={isEn ? 'Country' : 'Pays'}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
              <input
                type="text"
                aria-label={isEn ? 'City' : 'Ville'}
                value={evCity}
                onChange={(e) => setEvCity(e.target.value)}
                placeholder={isEn ? 'City' : 'Ville'}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                aria-label={isEn ? 'Sector' : 'Secteur'}
                value={evSector}
                onChange={(e) => setEvSector(e.target.value)}
                placeholder={isEn ? 'Sector' : 'Secteur'}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
              <select
                aria-label={isEn ? 'Format' : 'Format'}
                value={evFormat}
                onChange={(e) => setEvFormat(e.target.value as EventFormat)}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
              >
                <option value="hybrid">{isEn ? 'Hybrid' : 'Hybride'}</option>
                <option value="in_person">{isEn ? 'In-Person' : 'Présentiel'}</option>
                <option value="virtual">{isEn ? 'Online' : 'En ligne'}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="adm-ev-cap" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Capacity (seats)' : 'Capacité (places)'}
                </label>
                <input
                  id="adm-ev-cap"
                  type="number"
                  min={1}
                  aria-label={isEn ? 'Capacity' : 'Capacité'}
                  value={evCapacity}
                  onChange={(e) => setEvCapacity(Number(e.target.value))}
                  placeholder={isEn ? 'Capacity' : 'Capacité'}
                  className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="adm-ev-fee" className="block text-[11px] font-medium text-[#646464] dark:text-[#A7A7A7] mb-1">
                  {isEn ? 'Fee (€)' : 'Tarif (€)'}
                </label>
                <input
                  id="adm-ev-fee"
                  type="number"
                  min={0}
                  aria-label={isEn ? 'Fee EUR' : 'Tarif EUR'}
                  value={evFee}
                  onChange={(e) => setEvFee(Number(e.target.value))}
                  placeholder={isEn ? 'Fee EUR' : 'Tarif EUR'}
                  className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
                />
              </div>
            </div>
            <textarea
              rows={2}
              aria-label={isEn ? 'Summary and agenda' : 'Résumé et programme'}
              value={evSummary}
              onChange={(e) => setEvSummary(e.target.value)}
              placeholder={isEn ? 'Summary and agenda' : 'Résumé et programme'}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-full orange-glow-btn text-xs font-semibold transition-all disabled:opacity-60"
            >
              {isEn ? 'Publish event' : 'Publier l’événement'}
            </button>
          </form>

          <div className="lg:col-span-7 porcelain-card rounded-3xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? `Events (${filteredEvents.length})` : `Événements (${filteredEvents.length})`}
              </h2>
              <div className="relative flex items-center min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#A7A7A7]" />
                <input
                  type="text"
                  aria-label={isEn ? 'Filter events' : 'Filtrer les événements'}
                  value={evFilter}
                  onChange={(e) => setEvFilter(e.target.value)}
                  placeholder={isEn ? 'Title, city, or sector...' : 'Titre, ville ou secteur...'}
                  className="w-full min-h-[36px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-8 pr-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                />
              </div>
            </div>
            <div className="divide-y divide-[var(--ae-border)]">
              {filteredEvents.map((ev) => (
                <div key={ev.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{ev.title}</p>
                    <p className="text-xs text-[#646464] dark:text-[#A7A7A7] font-mono tabular-nums">
                      {ev.city} · {ev.registeredCount}/{ev.capacity} ·{' '}
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
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingEvent(ev)}
                      className="min-h-[34px] inline-flex items-center gap-1 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                    >
                      <Edit3 className="h-3 w-3 text-[#E85002]" />
                      <span>{isEn ? 'Edit' : 'Modifier'}</span>
                    </button>
                    {ev.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() => handleEventStatus(ev.id, 'published')}
                        className="min-h-[34px] rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        {isEn ? 'Publish' : 'Publier'}
                      </button>
                    )}
                    {ev.status === 'published' && (
                      <button
                        type="button"
                        onClick={() => handleEventStatus(ev.id, 'suspended')}
                        className="min-h-[34px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:bg-amber-50 dark:hover:bg-amber-950/50 hover:text-amber-700 dark:hover:text-amber-300"
                      >
                        {isEn ? 'Suspend' : 'Suspendre'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEventStatus(ev.id, 'archived')}
                      className="min-h-[34px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-3 text-xs font-medium text-[#646464] dark:text-[#A7A7A7] hover:border-[#C10801] hover:text-[#C10801] dark:hover:text-[#F16001]"
                    >
                      {isEn ? 'Archive' : 'Archiver'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Networks */}
      {data && tab === 'networks' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleCreateNetwork}
            className="lg:col-span-5 porcelain-card rounded-3xl p-5 space-y-3.5"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
              <Globe className="h-4 w-4 text-[#E85002]" />
              <span>{isEn ? 'Create a business network' : 'Créer un réseau professionnel'}</span>
            </div>
            <input
              type="text"
              required
              aria-label={isEn ? 'Network name' : 'Nom du réseau'}
              value={netName}
              onChange={(e) => setNetName(e.target.value)}
              placeholder={isEn ? 'Network name (e.g. WAEMU FinTech Circle)' : 'Nom du réseau (ex: Cercle FinTech UEMOA)'}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <input
              type="text"
              aria-label={isEn ? 'Countries covered' : 'Pays couverts'}
              value={netCountries}
              onChange={(e) => setNetCountries(e.target.value)}
              placeholder={isEn ? 'Countries (comma-separated)' : 'Pays (séparés par virgule)'}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <input
              type="text"
              aria-label={isEn ? 'Sectors' : 'Secteurs'}
              value={netSectors}
              onChange={(e) => setNetSectors(e.target.value)}
              placeholder={isEn ? 'Sectors (comma-separated)' : 'Secteurs (séparés par virgule)'}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <input
              type="email"
              aria-label={isEn ? 'Network contact email' : 'Email de contact réseau'}
              value={netEmail}
              onChange={(e) => setNetEmail(e.target.value)}
              placeholder={isEn ? 'Network contact email' : 'Email contact du réseau'}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <textarea
              rows={2}
              aria-label={isEn ? 'Public network summary' : 'Résumé public du réseau'}
              value={netSummary}
              onChange={(e) => setNetSummary(e.target.value)}
              placeholder={isEn ? 'Public summary visible to visitors...' : 'Résumé public visible par les visiteurs...'}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <textarea
              rows={2}
              aria-label={isEn ? 'Full network description' : 'Description complète du réseau'}
              value={netFullDesc}
              onChange={(e) => setNetFullDesc(e.target.value)}
              placeholder={isEn ? 'Full description (subscribers only)...' : 'Description complète (réservée abonnés)...'}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] placeholder:text-[#A7A7A7] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-full orange-glow-btn text-xs font-semibold transition-all disabled:opacity-60"
            >
              {isEn ? 'Publish network' : 'Publier le réseau'}
            </button>
          </form>

          <div className="lg:col-span-7 porcelain-card rounded-3xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn
                  ? `Published networks (${filteredNetworks.length})`
                  : `Réseaux publiés (${filteredNetworks.length})`}
              </h2>
              <div className="relative flex items-center min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#A7A7A7]" />
                <input
                  type="text"
                  aria-label={isEn ? 'Filter networks' : 'Filtrer les réseaux'}
                  value={netFilter}
                  onChange={(e) => setNetFilter(e.target.value)}
                  placeholder={isEn ? 'Name, country, or sector...' : 'Nom, pays ou secteur...'}
                  className="w-full min-h-[36px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-8 pr-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                />
              </div>
            </div>
            <div className="divide-y divide-[var(--ae-border)]">
              {filteredNetworks.map((net) => (
                <div key={net.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9] truncate">{net.name}</p>
                    <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
                      {net.countries.map((c) => translateCountry(c, lang)).join(', ')} ·{' '}
                      {net.sectors.map((s) => translateSector(s, lang)).join(', ')} ·{' '}
                      {net.status === 'published'
                        ? isEn
                          ? 'Published'
                          : 'Publié'
                        : net.status === 'draft'
                          ? isEn
                            ? 'Draft'
                            : 'Brouillon'
                          : net.status === 'suspended'
                            ? isEn
                              ? 'Suspended'
                              : 'Suspendu'
                            : isEn
                              ? 'Archived'
                              : 'Archivé'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingNet(net)}
                      className="min-h-[34px] inline-flex items-center gap-1 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                    >
                      <Edit3 className="h-3 w-3 text-[#E85002]" />
                      <span>{isEn ? 'Edit' : 'Modifier'}</span>
                    </button>
                    {net.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() => handleNetworkStatus(net.id, 'published')}
                        className="min-h-[34px] rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        {isEn ? 'Publish' : 'Publier'}
                      </button>
                    )}
                    {net.status === 'published' && (
                      <button
                        type="button"
                        onClick={() => handleNetworkStatus(net.id, 'suspended')}
                        className="min-h-[34px] rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:bg-amber-50 dark:hover:bg-amber-950/50 hover:text-amber-700 dark:hover:text-amber-300"
                      >
                        {isEn ? 'Suspend' : 'Suspendre'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleNetworkStatus(net.id, 'archived')}
                      className="min-h-[34px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-3 text-xs font-medium text-[#646464] dark:text-[#A7A7A7] hover:border-[#C10801] hover:text-[#C10801] dark:hover:text-[#F16001]"
                    >
                      {isEn ? 'Archive' : 'Archiver'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Members & Enterprises Verification */}
      {data && tab === 'members' && (
        <div className="space-y-6">
          <div className="porcelain-card rounded-3xl p-5 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#E85002]" />
                <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                  {isEn
                    ? `Member accounts (${filteredMembers.length})`
                    : `Comptes membres (${filteredMembers.length})`}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex items-center min-w-[200px]">
                  <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[#A7A7A7]" />
                  <input
                    type="text"
                    aria-label={isEn ? 'Search a member' : 'Rechercher un membre'}
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                    placeholder={isEn ? 'Name, email, or city...' : 'Nom, email ou ville...'}
                    className="w-full min-h-[36px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] pl-8 pr-3 text-xs text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                  />
                </div>
                <select
                  aria-label={isEn ? 'Filter by role' : 'Filtrer par rôle'}
                  value={memberRoleFilter}
                  onChange={(e) => setMemberRoleFilter(e.target.value as 'all' | UserRole)}
                  className="min-h-[36px] rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-2.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                >
                  <option value="all">{isEn ? 'All roles' : 'Tous rôles'}</option>
                  <option value="subscriber">{isEn ? 'Subscribers' : 'Abonnés'}</option>
                  <option value="personnel">{isEn ? 'Personal' : 'Personnel'}</option>
                  <option value="organizer">{isEn ? 'Organizers' : 'Organisateurs'}</option>
                  <option value="admin">{isEn ? 'Admins' : 'Admins'}</option>
                </select>
              </div>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9]">
                <tr>
                  <th className="py-2.5 px-3 rounded-l-xl">{isEn ? 'Member' : 'Membre'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Role' : 'Rôle'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Subscription' : 'Abonnement'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Location' : 'Localisation'}</th>
                  <th className="py-2.5 px-3 text-right rounded-r-xl">{isEn ? 'Moderation' : 'Modération'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ae-border)]">
                {filteredMembers.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3 px-3">
                      <p className="font-bold text-[#000000] dark:text-[#F9F9F9]">{m.fullName}</p>
                      <p className="text-[#646464] dark:text-[#A7A7A7]">{m.email}</p>
                    </td>
                    <td className="py-3 px-3">
                      {m.role === 'admin' ? (
                        <span className="font-semibold text-[#E85002]">admin</span>
                      ) : (
                        <select
                          aria-label={isEn ? `Role of ${m.fullName}` : `Rôle de ${m.fullName}`}
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as UserRole)}
                          className="rounded-xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-2.5 py-1.5 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:outline-none"
                        >
                          <option value="personnel">{isEn ? 'Personal' : 'personnel'}</option>
                          <option value="subscriber">{isEn ? 'Subscriber' : 'subscriber'}</option>
                          <option value="organizer">{isEn ? 'Organizer' : 'organizer'}</option>
                        </select>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[#333333] dark:text-[#D9C3AB] font-medium">
                      {translateRole(m.role, m.subscriptionStatus, lang)}
                    </td>
                    <td className="py-3 px-3 text-[#646464] dark:text-[#A7A7A7]">
                      {m.city}, {translateCountry(m.country, lang)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {m.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleToggleSuspendMember(m.id, !m.suspended)}
                          className={`min-h-[34px] rounded-full px-3 text-xs font-semibold transition-colors ${
                            m.suspended
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                              : 'border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] hover:border-[#C10801] hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-[#C10801] dark:hover:text-[#F16001]'
                          }`}
                        >
                          {m.suspended ? (isEn ? 'Reactivate' : 'Réactiver') : isEn ? 'Suspend' : 'Suspendre'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="porcelain-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#E85002]" />
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn
                  ? `Company page verification (${data.enterprises.length})`
                  : `Vérification des pages entreprises (${data.enterprises.length})`}
              </h2>
            </div>
            <div className="divide-y divide-[var(--ae-border)]">
              {data.enterprises.map((ent) => (
                <div key={ent.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                  <div>
                    <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">{ent.name}</p>
                    <p className="text-[#646464] dark:text-[#A7A7A7]">
                      {translateSector(ent.sector, lang)} · {ent.city}, {translateCountry(ent.country, lang)} ·{' '}
                      {ent.verified ? (isEn ? 'Verified' : 'Vérifiée') : isEn ? 'Pending' : 'En attente'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleVerifyEnterprise(ent.id, !ent.verified)}
                    className={`min-h-[34px] rounded-full px-3.5 text-xs font-semibold transition-colors ${
                      ent.verified
                        ? 'border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] text-[#333333] dark:text-[#A7A7A7] hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-300'
                        : 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {ent.verified
                      ? isEn
                        ? 'Remove badge'
                        : 'Retirer badge'
                      : isEn
                        ? 'Verify company'
                        : 'Vérifier l’entreprise'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Reports */}
      {data && tab === 'reports' && (
        <div className="porcelain-card rounded-3xl p-5 space-y-3">
          <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
            {isEn ? 'Reports' : 'Signalements'}
          </h2>
          {data.reports.length === 0 ? (
            <p className="text-xs text-[#646464] dark:text-[#A7A7A7]">
              {isEn ? 'No open reports.' : 'Aucun signalement ouvert.'}
            </p>
          ) : (
            data.reports.map((rep) => (
              <div
                key={rep.id}
                className="ice-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"
              >
                <div>
                  <p className="text-sm font-bold text-[#000000] dark:text-[#F9F9F9]">
                    {isEn ? 'Target:' : 'Cible :'} {rep.targetType} ({rep.targetId}) ·{' '}
                    {isEn ? 'Status:' : 'Statut :'} {rep.status}
                  </p>
                  <p className="mt-1 text-xs text-[#333333] dark:text-[#A7A7A7]">{rep.reason}</p>
                </div>
                {rep.status === 'open' ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolveReport(rep.id, false)}
                      className="min-h-[36px] inline-flex items-center gap-1 rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-3 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
                    >
                      <Check className="h-3.5 w-3.5 text-[#E85002]" />
                      <span>{isEn ? 'Close' : 'Clôturer'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveReport(rep.id, true)}
                      className="min-h-[36px] rounded-full bg-[#C10801] px-3 text-xs font-semibold text-white hover:bg-[#E85002] transition-colors"
                    >
                      {isEn ? 'Suspend target' : 'Suspendre cible'}
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {isEn ? 'Resolved' : 'Traité'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 5: Payments, Subscription Logs & Audit */}
      {data && tab === 'audit' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="porcelain-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#E85002]" />
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Payments' : 'Paiements'}
              </h2>
            </div>
            <div className="divide-y divide-[var(--ae-border)] text-xs max-h-96 overflow-y-auto">
              {data.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-semibold text-[#000000] dark:text-[#F9F9F9]">
                      {p.receiptNumber} · {p.plan} ({p.status})
                    </p>
                    <p className="text-[#646464] dark:text-[#A7A7A7] font-mono">{p.paymentMethodLabel}</p>
                  </div>
                  <span className="font-mono font-bold text-[#E85002] tabular-nums">{p.amountEur} €</span>
                </div>
              ))}
            </div>
          </div>

          <div className="porcelain-card rounded-3xl p-5 space-y-3">
            <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
              {isEn ? 'Subscription events' : 'Événements d’abonnement'}
            </h2>
            <div className="divide-y divide-[var(--ae-border)] text-xs max-h-96 overflow-y-auto">
              {data.subscriptionLogs.map((s) => (
                <div key={s.id} className="py-2.5">
                  <p className="font-bold text-[#E85002]">
                    {s.eventType} {s.plan ? `· ${s.plan}` : ''}
                  </p>
                  <p className="text-[#000000] dark:text-[#F9F9F9]">{s.details}</p>
                  <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] font-mono tabular-nums">
                    {s.memberId} · {new Date(s.createdAt).toLocaleString(dateLocale)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="porcelain-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Audit log' : 'Journal d’audit'}
              </h2>
              <button
                type="button"
                onClick={handleExportAuditCsv}
                className="min-h-[32px] inline-flex items-center gap-1 rounded-full border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3 text-[11px] font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
              >
                <Download className="h-3 w-3 text-[#E85002]" />
                <span>CSV</span>
              </button>
            </div>
            <div className="divide-y divide-[var(--ae-border)] text-xs max-h-96 overflow-y-auto">
              {data.auditLogs.map((log) => (
                <div key={log.id} className="py-2.5">
                  <p className="font-bold text-[#E85002]">
                    {log.action} · {log.target}
                  </p>
                  <p className="text-[#000000] dark:text-[#F9F9F9]">{log.details}</p>
                  <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] font-mono tabular-nums">
                    {log.actorEmail} · {new Date(log.createdAt).toLocaleString(dateLocale)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEventEdit}
            className="w-full max-w-lg rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-3.5 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Edit event' : 'Modifier l’événement'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                aria-label={isEn ? 'Close' : 'Fermer'}
                className="p-1.5 rounded-full text-[#646464] dark:text-[#A7A7A7] hover:bg-[#F3EFEA] dark:hover:bg-[#1A1A1D] hover:text-[#000000] dark:hover:text-[#F9F9F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              required
              aria-label={isEn ? 'Event title' : 'Titre de l’événement'}
              value={editingEvent.title}
              onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                aria-label={isEn ? 'Country' : 'Pays'}
                value={editingEvent.country}
                onChange={(e) => setEditingEvent({ ...editingEvent, country: e.target.value })}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
              <input
                type="text"
                aria-label={isEn ? 'City' : 'Ville'}
                value={editingEvent.city}
                onChange={(e) => setEditingEvent({ ...editingEvent, city: e.target.value })}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                aria-label={isEn ? 'Sector' : 'Secteur'}
                value={editingEvent.sector}
                onChange={(e) => setEditingEvent({ ...editingEvent, sector: e.target.value })}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
              <input
                type="number"
                aria-label={isEn ? 'Capacity' : 'Capacité'}
                value={editingEvent.capacity}
                onChange={(e) => setEditingEvent({ ...editingEvent, capacity: Number(e.target.value) })}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
              <input
                type="number"
                aria-label={isEn ? 'Fee EUR' : 'Tarif EUR'}
                value={editingEvent.feeEur}
                onChange={(e) => setEditingEvent({ ...editingEvent, feeEur: Number(e.target.value) })}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 font-mono text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
              />
            </div>
            <textarea
              rows={2}
              aria-label={isEn ? 'Public summary' : 'Résumé public'}
              value={editingEvent.publicSummary}
              onChange={(e) => setEditingEvent({ ...editingEvent, publicSummary: e.target.value })}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <textarea
              rows={3}
              aria-label={isEn ? 'Full description' : 'Description complète'}
              value={editingEvent.fullDescription}
              onChange={(e) => setEditingEvent({ ...editingEvent, fullDescription: e.target.value })}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="min-h-[42px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-full orange-glow-btn px-5 text-xs font-semibold disabled:opacity-60"
              >
                {isEn ? 'Save' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Network Modal */}
      {editingNet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveNetworkEdit}
            className="w-full max-w-lg rounded-3xl border border-[var(--ae-border)] bg-white dark:bg-[#121214] p-6 space-y-3.5 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#000000] dark:text-[#F9F9F9]">
                {isEn ? 'Edit network' : 'Modifier le réseau'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingNet(null)}
                aria-label={isEn ? 'Close' : 'Fermer'}
                className="p-1.5 rounded-full text-[#646464] dark:text-[#A7A7A7] hover:bg-[#F3EFEA] dark:hover:bg-[#1A1A1D] hover:text-[#000000] dark:hover:text-[#F9F9F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              required
              aria-label={isEn ? 'Network name' : 'Nom du réseau'}
              value={editingNet.name}
              onChange={(e) => setEditingNet({ ...editingNet, name: e.target.value })}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <input
              type="email"
              aria-label={isEn ? 'Contact email' : 'Email de contact'}
              value={editingNet.contactEmail}
              onChange={(e) => setEditingNet({ ...editingNet, contactEmail: e.target.value })}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <input
              type="text"
              aria-label={isEn ? 'Countries covered' : 'Pays couverts'}
              value={editingNet.countries.join(', ')}
              onChange={(e) =>
                setEditingNet({
                  ...editingNet,
                  countries: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="w-full min-h-[42px] rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] px-3.5 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <textarea
              rows={2}
              aria-label={isEn ? 'Public summary' : 'Résumé public'}
              value={editingNet.publicSummary}
              onChange={(e) => setEditingNet({ ...editingNet, publicSummary: e.target.value })}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <textarea
              rows={3}
              aria-label={isEn ? 'Full description' : 'Description complète'}
              value={editingNet.fullDescription}
              onChange={(e) => setEditingNet({ ...editingNet, fullDescription: e.target.value })}
              className="w-full rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#1A1A1D] p-3 text-sm text-[#000000] dark:text-[#F9F9F9] focus:border-[#E85002] focus:bg-white dark:focus:bg-[#121214] focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingNet(null)}
                className="min-h-[42px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#1A1A1D] px-4 text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002]"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-full orange-glow-btn px-5 text-xs font-semibold disabled:opacity-60"
              >
                {isEn ? 'Save' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
