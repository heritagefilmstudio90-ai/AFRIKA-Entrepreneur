import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AFRICA_DIASPORA_COUNTRIES,
  WORLD_REGION_PRESETS,
  buildDiasporaCorridors,
  buildHubClusters,
  clampMapTransform,
  findCountryByIso,
  findCountryMeta,
  getAllCityOptions,
  getCityCoordinates,
  getGroupedCountryOptions,
} from './worldMap';
import type { BusinessEvent, ProfessionalNetwork } from '../types/domain';

test('AFRICA_DIASPORA_COUNTRIES covers all 54 African nations and 30+ Diaspora destinations', () => {
  const africa = AFRICA_DIASPORA_COUNTRIES.filter((c) => c.region === 'africa');
  const diaspora = AFRICA_DIASPORA_COUNTRIES.filter((c) => c.region === 'diaspora');

  assert.equal(africa.length, 54);
  assert.ok(diaspora.length >= 30);

  // Spot-check key ISO codes matching world-atlas/countries-110m.json
  assert.equal(findCountryByIso('686')?.nameFr, 'Sénégal');
  assert.equal(findCountryByIso('384')?.nameEn, 'Côte d’Ivoire');
  assert.equal(findCountryByIso('566')?.primaryCity, 'Lagos');
  assert.equal(findCountryByIso('646')?.primaryCity, 'Kigali');
  assert.equal(findCountryByIso('504')?.primaryCity, 'Casablanca');
  assert.equal(findCountryByIso('250')?.nameFr, 'France');
  assert.equal(findCountryByIso('840')?.nameEn, 'United States');
  assert.equal(findCountryByIso('784')?.primaryCity, 'Dubaï');
});

test('findCountryMeta resolves French, English, and alias spellings cleanly', () => {
  assert.equal(findCountryMeta('Ivory Coast')?.isoNumeric, '384');
  assert.equal(findCountryMeta("Côte d'Ivoire")?.isoNumeric, '384');
  assert.equal(findCountryMeta('United Kingdom')?.nameFr, 'Royaume-Uni');
  assert.equal(findCountryMeta('USA')?.isoNumeric, '840');
  assert.equal(findCountryMeta('DRC')?.primaryCity, 'Kinshasa');
  assert.equal(findCountryMeta('Maroc')?.nameEn, 'Morocco');
});

test('getCityCoordinates resolves primary, secondary, and fallback country coordinates', () => {
  const [dakarLng, dakarLat] = getCityCoordinates('Dakar', 'Sénégal');
  assert.ok(dakarLng < -16 && dakarLat > 14);
  const [marLng, marLat] = getCityCoordinates('Marrakech', 'Maroc');
  assert.ok(marLng < -7 && marLat > 31);
  const [unknownLng, unknownLat] = getCityCoordinates('UnknownTown', 'Kenya');
  assert.deepEqual([unknownLng, unknownLat], [36.8219, -1.2921]);
});

test('buildHubClusters aggregates multiple events per city and optional directory country hubs', () => {
  const events: BusinessEvent[] = [
    {
      id: 'e1',
      organizerId: 'o1',
      organizerName: 'H1',
      title: 'Dakar Fintech',
      publicSummary: 'Summary',
      fullDescription: '',
      dateIso: '2026-12-10T09:00:00.000Z',
      country: 'Sénégal',
      city: 'Dakar',
      sector: 'Fintech',
      format: 'hybrid',
      venueAddress: '',
      virtualLink: '',
      capacity: 100,
      registeredCount: 40,
      feeEur: 0,
      status: 'published',
    },
    {
      id: 'e2',
      organizerId: 'o1',
      organizerName: 'H1',
      title: 'Dakar Architecture',
      publicSummary: 'Summary',
      fullDescription: '',
      dateIso: '2026-12-12T09:00:00.000Z',
      country: 'Sénégal',
      city: 'Dakar',
      sector: 'Architecture',
      format: 'in_person',
      venueAddress: '',
      virtualLink: '',
      capacity: 80,
      registeredCount: 30,
      feeEur: 0,
      status: 'published',
    },
    {
      id: 'e3',
      organizerId: 'o2',
      organizerName: 'H2',
      title: 'Paris Forum',
      publicSummary: 'Summary',
      fullDescription: '',
      dateIso: '2026-12-20T09:00:00.000Z',
      country: 'France',
      city: 'Paris',
      sector: 'Design',
      format: 'in_person',
      venueAddress: '',
      virtualLink: '',
      capacity: 90,
      registeredCount: 50,
      feeEur: 25,
      status: 'published',
    },
  ];

  const activeOnly = buildHubClusters('events', events, [], 'en', false);
  assert.equal(activeOnly.length, 2);
  const dakar = activeOnly.find((c) => c.city === 'Dakar');
  assert.equal(dakar?.count, 2);
  assert.equal(dakar?.events.length, 2);

  const withAllCountries = buildHubClusters('events', events, [], 'fr', true);
  assert.ok(withAllCountries.length >= AFRICA_DIASPORA_COUNTRIES.length);

  const arcs = buildDiasporaCorridors(withAllCountries);
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].fromCity, 'Dakar');
  assert.equal(arcs[0].toCity, 'Paris');
});

test('buildHubClusters maps multi-country networks to active hubs and clampMapTransform constrains pan/zoom', () => {
  const nets: ProfessionalNetwork[] = [
    {
      id: 'net-1',
      name: 'BTT Africa',
      publicSummary: 'Construction',
      fullDescription: '',
      countries: ['Maroc', 'Côte d’Ivoire', 'France'],
      sectors: ['BTT', 'Architecture'],
      contactEmail: 'btt@ae.com',
      memberCount: 150,
      status: 'published',
    },
  ];
  const clusters = buildHubClusters('networks', [], nets, 'fr', false);
  assert.equal(clusters.length, 3);

  assert.deepEqual(clampMapTransform(0.5, 500, 500), { scale: 1, tx: 0, ty: 0 });
  const zoomed = clampMapTransform(10, 99999, -99999, 960, 480);
  assert.equal(zoomed.scale, 7);
  assert.ok(zoomed.tx <= 3500 && zoomed.ty >= -2000);
  assert.ok(WORLD_REGION_PRESETS.some((p) => p.id === 'africa'));
  const grouped = getGroupedCountryOptions();
  assert.equal(grouped.africa.length, 54);
  assert.ok(grouped.diaspora.length >= 34);
  assert.ok(getAllCityOptions().includes('Kigali'));
});
