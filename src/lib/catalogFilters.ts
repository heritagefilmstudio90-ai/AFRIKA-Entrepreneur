import type { BusinessEvent, BusinessOpportunity, ProfessionalNetwork } from '../types/domain';
import { findCountryMeta, normalizeGeoText } from './worldMap';

export type EventDateFilter = 'all' | '7d' | 'this_month' | '30d' | 'custom' | '2026' | '2027';

export const CATALOG_CORE_SECTORS = [
  'Tech',
  'Agriculture',
  'Artisanat',
  'Événementiel',
  'BTT',
  'Architecture',
  'Design',
  'Fintech',
  'Capital-Risque',
  'Agro-industrie',
] as const;

export interface SectorFilterOption {
  id: string;
  count: number;
}

export interface EventFilterParams {
  searchQuery?: string;
  country?: string;
  city?: string;
  sector?: string;
  organizer?: string;
  format?: string;
  dateFilter?: EventDateFilter;
  customStartDate?: string;
  customEndDate?: string;
  nowMs?: number;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesSectorValue(itemSectors: string | string[], filterSector: string): boolean {
  if (!filterSector || filterSector === 'all') return true;
  const target = normalizeSearchText(filterSector);
  const list = Array.isArray(itemSectors) ? itemSectors : [itemSectors];
  return list.some((s) => {
    const norm = normalizeSearchText(s);
    if (norm === target) return true;
    // Allow "Agriculture" to also match "Agro-industrie" & vice versa when strictly relevant?
    // Keep exact normalized match so Agriculture and Agro-industrie stay distinct tabs unless equal.
    return false;
  });
}

export function matchesCountryValue(itemCountries: string | string[], filterCountry: string): boolean {
  if (!filterCountry || filterCountry === 'all') return true;
  const filterMeta = findCountryMeta(filterCountry);
  const targetNorm = normalizeGeoText(filterCountry);
  const list = Array.isArray(itemCountries) ? itemCountries : [itemCountries];
  return list.some((c) => {
    if (normalizeGeoText(c) === targetNorm) return true;
    if (filterMeta) {
      const cMeta = findCountryMeta(c);
      if (cMeta && cMeta.isoNumeric === filterMeta.isoNumeric) return true;
    }
    return false;
  });
}

export function buildSectorFilterOptions(
  events: BusinessEvent[],
  networks: ProfessionalNetwork[],
  opportunities: BusinessOpportunity[],
  subTab: 'events' | 'networks' | 'favorites' | 'opportunities',
  favoriteEventIds: string[] = []
): SectorFilterOption[] {
  const counts = new Map<string, number>();

  for (const sector of CATALOG_CORE_SECTORS) {
    counts.set(sector, 0);
  }

  const increment = (rawSector: string) => {
    if (!rawSector) return;
    const normRaw = normalizeSearchText(rawSector);
    const matchingKey = Array.from(counts.keys()).find((k) => normalizeSearchText(k) === normRaw);
    const key = matchingKey || rawSector;
    counts.set(key, (counts.get(key) || 0) + 1);
  };

  if (subTab === 'networks') {
    for (const net of networks) {
      for (const s of net.sectors) increment(s);
    }
  } else if (subTab === 'opportunities') {
    for (const opp of opportunities) {
      increment(opp.sector);
    }
  } else {
    const source =
      subTab === 'favorites' ? events.filter((e) => favoriteEventIds.includes(e.id)) : events;
    for (const ev of source) {
      increment(ev.sector);
    }
  }

  return Array.from(counts.entries()).map(([id, count]) => ({ id, count }));
}

export function toggleFavoriteId(currentIds: string[], eventId: string): string[] {
  return currentIds.includes(eventId)
    ? currentIds.filter((id) => id !== eventId)
    : [...currentIds, eventId];
}

export interface EventSharePayload {
  title: string;
  text: string;
  url: string;
}

/**
 * Builds Web Share API payload for a BusinessEvent while strictly respecting
 * locked preview access rules (never leaking locked venueAddress/fullDescription/virtualLink).
 */
export function buildEventShareData(
  event: BusinessEvent,
  originUrl = 'https://africaentrepreneur.app',
  lang: 'fr' | 'en' = 'fr'
): EventSharePayload {
  const cleanOrigin = originUrl.replace(/\/+$/, '');
  const formattedDate = new Date(event.dateIso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const location =
    !event.locked && event.venueAddress
      ? `${event.venueAddress}, ${event.city}, ${event.country}`
      : `${event.city}, ${event.country}`;

  const text =
    lang === 'en'
      ? `${event.title} · Hosted by ${event.organizerName}\n${formattedDate} · ${location}\n${event.publicSummary}`
      : `${event.title} · Organisé par ${event.organizerName}\n${formattedDate} · ${location}\n${event.publicSummary}`;

  return {
    title: event.title,
    text,
    url: `${cleanOrigin}/?event=${encodeURIComponent(event.id)}`,
  };
}

export function filterEvents(events: BusinessEvent[], params: EventFilterParams): BusinessEvent[] {
  const q = normalizeSearchText(params.searchQuery || '');
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const nowMs = params.nowMs ?? Date.now();
  const nowDate = new Date(nowMs);
  const country = params.country || 'all';
  const city = params.city || 'all';
  const sector = params.sector || 'all';
  const organizer = params.organizer || 'all';
  const format = params.format || 'all';
  const dateFilter = params.dateFilter || 'all';

  const customStartMs =
    dateFilter === 'custom' && params.customStartDate
      ? Date.parse(`${params.customStartDate}T00:00:00.000Z`)
      : Number.NaN;
  const customEndMs =
    dateFilter === 'custom' && params.customEndDate
      ? Date.parse(`${params.customEndDate}T23:59:59.999Z`)
      : Number.NaN;

  return events.filter((ev) => {
    if (!matchesCountryValue(ev.country, country)) return false;
    if (city !== 'all' && normalizeSearchText(ev.city) !== normalizeSearchText(city)) return false;
    if (!matchesSectorValue(ev.sector, sector)) return false;
    if (organizer !== 'all' && ev.organizerName !== organizer) return false;
    if (format !== 'all' && ev.format !== format) return false;

    const evDate = new Date(ev.dateIso);
    const ms = evDate.getTime();

    if (dateFilter === '7d') {
      if (ms < nowMs || ms > nowMs + 7 * 86400000) return false;
    } else if (dateFilter === 'this_month') {
      if (
        evDate.getUTCFullYear() !== nowDate.getUTCFullYear() ||
        evDate.getUTCMonth() !== nowDate.getUTCMonth()
      ) {
        return false;
      }
    } else if (dateFilter === '30d') {
      if (ms < nowMs || ms > nowMs + 30 * 86400000) return false;
    } else if (dateFilter === 'custom') {
      if (!Number.isNaN(customStartMs) && ms < customStartMs) return false;
      if (!Number.isNaN(customEndMs) && ms > customEndMs) return false;
    } else if (dateFilter === '2026' || dateFilter === '2027') {
      if (evDate.getUTCFullYear() !== Number(dateFilter)) return false;
    }

    if (tokens.length > 0) {
      const countryMeta = findCountryMeta(ev.country);
      const haystackParts = [
        ev.title,
        ev.city,
        ev.country,
        countryMeta?.nameEn || '',
        countryMeta?.nameFr || '',
        ev.sector,
        ev.organizerName,
        ev.publicSummary,
        !ev.locked ? ev.venueAddress : '',
        !ev.locked ? ev.fullDescription : '',
        !ev.locked && Array.isArray(ev.highlights) ? ev.highlights.join(' ') : '',
      ];
      const haystack = normalizeSearchText(haystackParts.join(' '));
      return tokens.every((tok) => haystack.includes(tok));
    }
    return true;
  });
}

export function filterNetworks(
  networks: ProfessionalNetwork[],
  params: { searchQuery?: string; country?: string; sector?: string }
): ProfessionalNetwork[] {
  const q = normalizeSearchText(params.searchQuery || '');
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const country = params.country || 'all';
  const sector = params.sector || 'all';

  return networks.filter((n) => {
    if (!matchesCountryValue(n.countries, country)) return false;
    if (!matchesSectorValue(n.sectors, sector)) return false;
    if (tokens.length > 0) {
      const enCountries = n.countries.map((c) => findCountryMeta(c)?.nameEn || '').join(' ');
      const haystack = normalizeSearchText(
        [
          n.name,
          n.publicSummary,
          n.countries.join(' '),
          enCountries,
          n.sectors.join(' '),
          !n.locked ? n.fullDescription : '',
        ].join(' ')
      );
      return tokens.every((tok) => haystack.includes(tok));
    }
    return true;
  });
}

export function filterOpportunities(
  opportunities: BusinessOpportunity[],
  params: { searchQuery?: string; country?: string; sector?: string }
): BusinessOpportunity[] {
  const q = normalizeSearchText(params.searchQuery || '');
  const country = params.country || 'all';
  const sector = params.sector || 'all';

  return opportunities.filter((o) => {
    if (!matchesCountryValue(o.country, country)) return false;
    if (!matchesSectorValue(o.sector, sector)) return false;
    if (q) {
      const countryMeta = findCountryMeta(o.country);
      const haystack = normalizeSearchText(
        [o.title, o.publicSummary, o.sector, o.country, countryMeta?.nameEn || '', o.companyName].join(' ')
      );
      return haystack.includes(q);
    }
    return true;
  });
}
