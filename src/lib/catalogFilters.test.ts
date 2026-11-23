import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_CORE_SECTORS,
  buildEventShareData,
  buildSectorFilterOptions,
  filterEvents,
  filterNetworks,
  toggleFavoriteId,
} from './catalogFilters';
import type { BusinessEvent, ProfessionalNetwork } from '../types/domain';

const sampleEvents: BusinessEvent[] = [
  {
    id: 'evt-dakar',
    organizerId: 'u-orga',
    organizerName: 'PayTeranga Forum',
    title: 'Dakar Fintech & Paiements Summit',
    publicSummary: 'Rencontres UEMOA et innovation bancaire.',
    fullDescription: 'Programme complet avec ateliers conformité BCEAO.',
    dateIso: '2026-12-14T09:00:00.000Z',
    country: 'Sénégal',
    city: 'Dakar',
    sector: 'Fintech',
    format: 'hybrid',
    venueAddress: 'CICAD',
    virtualLink: 'https://meet.example/dakar',
    capacity: 120,
    registeredCount: 40,
    feeEur: 0,
    status: 'published',
    locked: false,
  },
  {
    id: 'evt-abidjan',
    organizerId: 'u-orga',
    organizerName: 'AgriCI',
    title: 'Abidjan AgriTech & Transformation Export',
    publicSummary: 'Chaînes de valeur cacao et anacarde.',
    fullDescription: 'Détails confidentiels réservés aux abonnés.',
    dateIso: '2027-02-18T14:00:00.000Z',
    country: 'Côte d’Ivoire',
    city: 'Abidjan',
    sector: 'Agro-industrie',
    format: 'virtual',
    venueAddress: 'SECRET_VENUE',
    virtualLink: 'https://meet.example/abidjan',
    capacity: 200,
    registeredCount: 75,
    feeEur: 0,
    status: 'published',
    locked: true,
  },
  {
    id: 'evt-kigali',
    organizerId: 'u-orga',
    organizerName: 'Kigali Innovation Lab',
    title: 'Kigali Tech & AI Founders',
    publicSummary: 'Engineering and cloud builders summit.',
    fullDescription: '',
    dateIso: '2027-03-04T09:00:00.000Z',
    country: 'Rwanda',
    city: 'Kigali',
    sector: 'Tech',
    format: 'hybrid',
    venueAddress: 'KCC',
    virtualLink: '',
    capacity: 150,
    registeredCount: 60,
    feeEur: 0,
    status: 'published',
    locked: false,
  },
];

const sampleNetworks: ProfessionalNetwork[] = [
  {
    id: 'net-diaspora',
    name: 'Cercle Investisseurs Diaspora Europe–Afrique',
    publicSummary: 'Syndicat de business angels et dirigeants.',
    fullDescription: 'Co-investissement amorçage Fintech et énergie verte.',
    countries: ['France', 'Royaume-Uni', 'Sénégal'],
    sectors: ['Capital-Risque', 'Fintech'],
    contactEmail: 'diaspora@africaentrepreneur.com',
    memberCount: 210,
    status: 'published',
    locked: false,
  },
  {
    id: 'net-agro',
    name: 'Réseau Agro-Industrie Afrique de l’Ouest',
    publicSummary: 'Transformateurs et exportateurs agricoles.',
    fullDescription: 'Secret verrouillé',
    countries: ['Côte d’Ivoire', 'Ghana'],
    sectors: ['Agro-industrie'],
    contactEmail: 'agro@africaentrepreneur.com',
    memberCount: 135,
    status: 'published',
    locked: true,
  },
];

test('toggleFavoriteId adds and removes event IDs idempotently', () => {
  const afterAdd = toggleFavoriteId([], 'evt-dakar');
  assert.deepEqual(afterAdd, ['evt-dakar']);
  const afterSecond = toggleFavoriteId(afterAdd, 'evt-abidjan');
  assert.deepEqual(afterSecond, ['evt-dakar', 'evt-abidjan']);
  const afterRemove = toggleFavoriteId(afterSecond, 'evt-dakar');
  assert.deepEqual(afterRemove, ['evt-abidjan']);
});

test('filterEvents filters by city, title, organizer, location, English country aliases, and respects locked details', () => {
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'Abidjan' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'PayTeranga' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'senegal' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { country: 'Senegal' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { country: 'Ivory Coast' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'dakar payteranga' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'cote cacao' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { organizer: 'AgriCI' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'confidentiels' }).length, 0);
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'BCEAO' }).length, 1);
  assert.equal(filterEvents(sampleEvents, { searchQuery: 'CICAD' }).length, 1);
});

test('filterEvents filters by 7d, this_month, and custom date ranges accurately', () => {
  const dec10 = Date.parse('2026-12-10T08:00:00.000Z');
  const next7Days = filterEvents(sampleEvents, { dateFilter: '7d', nowMs: dec10 });
  assert.equal(next7Days.length, 1);
  assert.equal(next7Days[0].id, 'evt-dakar');

  const thisMonth = filterEvents(sampleEvents, { dateFilter: 'this_month', nowMs: dec10 });
  assert.equal(thisMonth.length, 1);
  assert.equal(thisMonth[0].id, 'evt-dakar');

  const dec01 = Date.parse('2026-12-01T08:00:00.000Z');
  assert.equal(filterEvents(sampleEvents, { dateFilter: '7d', nowMs: dec01 }).length, 0);
  assert.equal(filterEvents(sampleEvents, { dateFilter: 'this_month', nowMs: dec01 }).length, 1);

  const customFeb = filterEvents(sampleEvents, {
    dateFilter: 'custom',
    customStartDate: '2027-02-01',
    customEndDate: '2027-02-28',
  });
  assert.equal(customFeb.length, 1);
  assert.equal(customFeb[0].id, 'evt-abidjan');

  const customStartOnly = filterEvents(sampleEvents, {
    dateFilter: 'custom',
    customStartDate: '2026-12-01',
  });
  assert.equal(customStartOnly.length, 3);
});

test('buildEventShareData formats Web Share payload and hides locked venueAddress', () => {
  const unlockedShare = buildEventShareData(sampleEvents[0], 'https://example.app/', 'fr');
  assert.equal(unlockedShare.title, 'Dakar Fintech & Paiements Summit');
  assert.equal(unlockedShare.url, 'https://example.app/?event=evt-dakar');
  assert.ok(unlockedShare.text.includes('CICAD'));
  assert.ok(unlockedShare.text.includes('PayTeranga Forum'));

  const lockedShare = buildEventShareData(sampleEvents[1], 'https://example.app', 'fr');
  assert.equal(lockedShare.url, 'https://example.app/?event=evt-abidjan');
  assert.ok(lockedShare.text.includes('Abidjan, Côte d’Ivoire'));
  assert.equal(lockedShare.text.includes('SECRET_VENUE'), false);
});

test('filterNetworks matches name, sectors, countries, and unlocked fullDescription', () => {
  assert.equal(filterNetworks(sampleNetworks, { searchQuery: 'Fintech' }).length, 1);
  assert.equal(filterNetworks(sampleNetworks, { searchQuery: 'Ghana' }).length, 1);
  assert.equal(filterNetworks(sampleNetworks, { country: 'United Kingdom' }).length, 1);
  assert.equal(filterNetworks(sampleNetworks, { searchQuery: 'verrouillé' }).length, 0);
  assert.equal(filterNetworks(sampleNetworks, { searchQuery: 'amorcage' }).length, 1);
});

test('buildSectorFilterOptions includes all required business sectors and counts', () => {
  const opts = buildSectorFilterOptions(sampleEvents, sampleNetworks, [], 'events', []);
  for (const requiredSector of ['Tech', 'Agriculture', 'Artisanat', 'Événementiel', 'BTT', 'Architecture', 'Design']) {
    assert.ok(CATALOG_CORE_SECTORS.includes(requiredSector as (typeof CATALOG_CORE_SECTORS)[number]));
    assert.ok(opts.some((o) => o.id === requiredSector));
  }
  assert.equal(opts.find((o) => o.id === 'Tech')?.count, 1);
  assert.equal(opts.find((o) => o.id === 'Fintech')?.count, 1);
});
