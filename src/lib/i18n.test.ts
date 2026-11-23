import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UI_COPY,
  localeForLang,
  translateCountry,
  translateFormat,
  translateOppCategory,
  translateRole,
  translateSector,
} from './i18n';

import {
  localizeCity,
  localizeEvent,
  localizeGroup,
  localizeNetwork,
  localizeOpportunity,
} from './contentI18n';
import type { BusinessEvent, BusinessOpportunity, DiscussionGroup, ProfessionalNetwork } from '../types/domain';

test('i18n translates all requested business sectors, countries, formats, and roles in EN/FR', () => {
  assert.equal(translateSector('Artisanat', 'en'), 'Crafts & Artisanship');
  assert.equal(translateSector('Événementiel', 'en'), 'Events & Production');
  assert.equal(translateSector('BTT', 'en'), 'Construction & Civil (BTT)');
  assert.equal(translateSector('Architecture', 'en'), 'Architecture');
  assert.equal(translateSector('Design', 'en'), 'Design');
  assert.equal(translateSector('Artisanat', 'fr'), 'Artisanat');

  assert.equal(translateFormat('in_person', 'en'), 'In-Person');
  assert.equal(translateFormat('hybrid', 'en'), 'Hybrid');
  assert.equal(translateFormat('virtual', 'fr'), 'En ligne');

  assert.equal(translateCountry('Royaume-Uni', 'en'), 'United Kingdom');
  assert.equal(translateCountry('Maroc', 'en'), 'Morocco');
  assert.equal(translateCountry('Sénégal', 'en'), 'Senegal');

  assert.equal(translateRole('organizer', 'active', 'en'), 'Organizer');
  assert.equal(translateRole('subscriber', 'active', 'en'), 'Active Member');
  assert.equal(translateOppCategory('co_investment', 'en'), 'Co-Investment');
  assert.equal(localeForLang('en'), 'en-US');
  assert.equal(localeForLang('fr'), 'fr-FR');
  assert.notEqual(UI_COPY.en.navCatalogue, UI_COPY.fr.navCatalogue);
});

test('contentI18n localizes seeded events, networks, opportunities, groups, and cities while respecting locks', () => {
  assert.equal(localizeCity('Montréal', 'en'), 'Montreal');
  assert.equal(localizeCity('Londres', 'en'), 'London');
  assert.equal(localizeCity('Montréal', 'fr'), 'Montréal');

  const lockedEv: BusinessEvent = {
    id: 'evt-montreal',
    organizerId: 'u-admin',
    organizerName: 'Hub Diaspora Amérique du Nord',
    title: 'Montréal Tech, IA & Entrepreneuriat Diaspora',
    publicSummary: 'Résumé FR',
    fullDescription: '',
    dateIso: '2027-04-06T14:00:00.000Z',
    country: 'Canada',
    city: 'Montréal',
    sector: 'Tech',
    format: 'hybrid',
    venueAddress: '',
    virtualLink: '',
    capacity: 110,
    registeredCount: 68,
    feeEur: 0,
    imageUrl: '',
    status: 'published',
    highlights: [],
    locked: true,
  };

  const enLocked = localizeEvent(lockedEv, 'en');
  assert.equal(enLocked.city, 'Montreal');
  assert.equal(enLocked.title, 'Montreal Tech, AI & Diaspora Entrepreneurship');
  assert.equal(enLocked.fullDescription, '');
  assert.equal(enLocked.venueAddress, '');

  const enUnlocked = localizeEvent({ ...lockedEv, locked: false }, 'en');
  assert.ok(enUnlocked.venueAddress.includes('1250 Rue Guy'));
  assert.ok((enUnlocked.highlights?.length ?? 0) >= 2);

  const net: ProfessionalNetwork = {
    id: 'net-artisanat-design',
    name: 'Guilde Artisanat, Design & Événementiel Global',
    publicSummary: 'Résumé FR',
    fullDescription: 'Complet FR',
    countries: ['Maroc'],
    sectors: ['Artisanat', 'Design', 'Événementiel'],
    contactEmail: 'a@b.com',
    memberCount: 174,
    status: 'published',
    imageUrl: '',
    locked: false,
  };
  assert.equal(localizeNetwork(net, 'en').name, 'Global Crafts, Design & Events Guild');

  const opp: BusinessOpportunity = {
    id: 'opp-5',
    authorId: 'u-chidi',
    authorName: 'Chidi',
    companyName: 'BuildAfrica Consortium',
    title: 'Appel FR',
    category: 'call_for_projects',
    publicSummary: 'Résumé FR',
    fullDetails: 'Détails FR',
    country: 'Cameroun',
    sector: 'BTT',
    budgetRange: '250 000 € – 900 000 €',
    status: 'published',
    createdAt: '2026-11-20T09:30:00.000Z',
  };
  assert.ok(localizeOpportunity(opp, 'en').title.includes('Construction (BTT)'));

  const grp: DiscussionGroup = {
    id: 'grp-btt-arch',
    name: 'BTT, Architecture & Design Urbain',
    sector: 'BTT',
    description: 'Description FR',
    memberCount: 114,
  };
  assert.equal(localizeGroup(grp, 'en').name, 'Construction (BTT), Architecture & Urban Design');
});

