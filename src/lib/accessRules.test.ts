import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageEvent,
  canMessageRecipient,
  canRegisterForEvent,
  computeSubscriptionDates,
  sanitizeEventForUser,
  sanitizeOpportunityForUser,
} from './accessRules.ts';
import type { BusinessEvent, BusinessOpportunity, MemberAccount } from '../types/domain.ts';

const baseEvent: BusinessEvent = {
  id: 'evt-1',
  organizerId: 'u-orga',
  organizerName: 'Cercle Dakar',
  title: 'Sommet Fintech',
  publicSummary: 'Résumé public',
  fullDescription: 'Description confidentielle complète avec programme VIP.',
  dateIso: '2026-12-14T09:00:00.000Z',
  country: 'Sénégal',
  city: 'Dakar',
  sector: 'Fintech',
  format: 'hybrid',
  venueAddress: 'Pavillon Corniche Exact',
  virtualLink: 'https://secret.visio/room',
  capacity: 100,
  registeredCount: 40,
  feeEur: 0,
  status: 'published',
  highlights: ['18 fonds'],
};

const baseOpp: BusinessOpportunity = {
  id: 'opp-1',
  authorId: 'u-sub',
  authorName: 'Amina Diallo',
  companyName: 'PayTeranga SAS',
  title: 'Partenariat API Paiement UEMOA',
  category: 'commercial_partner',
  publicSummary: 'Recherche partenaires bancaires et distributeurs.',
  fullDetails: 'Détails confidentiels du mandat commercial et contacts directs.',
  country: 'Sénégal',
  sector: 'Fintech',
  budgetRange: '50k – 150k €',
  status: 'published',
  createdAt: '2026-11-15T10:00:00.000Z',
};

const personnelUser: MemberAccount = {
  id: 'u-pers',
  email: 'pers@example.com',
  emailVerified: true,
  fullName: 'Moussa',
  role: 'personnel',
  subscriptionStatus: 'none',
  country: 'France',
  city: 'Paris',
  language: 'fr',
  visibility: 'private',
  notificationsEnabled: true,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const subscriberUser: MemberAccount = {
  ...personnelUser,
  id: 'u-sub',
  role: 'subscriber',
  subscriptionStatus: 'active',
  subscriptionPlan: 'annual',
  subscriptionEnd: '2028-01-01T00:00:00.000Z',
};

const organizerUser: MemberAccount = {
  ...subscriberUser,
  id: 'u-orga',
  role: 'organizer',
};

test('RM-01 & RM-02: Personnel receives only preview, Subscriber receives full event details', () => {
  const preview = sanitizeEventForUser(baseEvent, personnelUser, false);
  assert.equal(preview.locked, true);
  assert.equal(preview.fullDescription, '');
  assert.equal(preview.virtualLink, '');
  assert.equal(preview.venueAddress, 'Réservé aux membres abonnés');

  const full = sanitizeEventForUser(baseEvent, subscriberUser, true);
  assert.equal(full.locked, false);
  assert.equal(full.fullDescription, baseEvent.fullDescription);
  assert.equal(full.virtualLink, baseEvent.virtualLink);
  assert.equal(full.isRegistered, true);
});

test('§4.2 & RM-02: Personnel receives only preview of opportunities, Subscriber receives full details', () => {
  const previewOpp = sanitizeOpportunityForUser(baseOpp, personnelUser);
  assert.equal(previewOpp.locked, true);
  assert.equal(previewOpp.fullDetails, '');
  assert.equal(previewOpp.companyName, 'Entreprise abonnée');

  const fullOpp = sanitizeOpportunityForUser(baseOpp, subscriberUser);
  assert.equal(fullOpp.locked, false);
  assert.equal(fullOpp.fullDetails, baseOpp.fullDetails);
  assert.equal(fullOpp.companyName, baseOpp.companyName);
});

test('§3 Roles: Organizer can manage only their own events, Admin can manage all events', () => {
  assert.equal(canManageEvent(baseEvent, organizerUser), true);
  assert.equal(canManageEvent({ organizerId: 'u-other' }, organizerUser), false);
  assert.equal(canManageEvent({ organizerId: 'u-other' }, { id: 'u-adm', role: 'admin' }), true);
  assert.equal(canManageEvent(baseEvent, subscriberUser), false);
});

test('RM-06: Registration enforces active subscription, capacity, and duplicate prevention', () => {
  const persAttempt = canRegisterForEvent(baseEvent, personnelUser, []);
  assert.equal(persAttempt.allowed, false);
  assert.equal(persAttempt.code, 'SUBSCRIPTION_REQUIRED');

  const okAttempt = canRegisterForEvent(baseEvent, subscriberUser, []);
  assert.equal(okAttempt.allowed, true);

  const dupAttempt = canRegisterForEvent(baseEvent, subscriberUser, [
    { id: 'r1', eventId: 'evt-1', memberId: 'u-sub', status: 'confirmed', confirmationCode: 'AE-1', createdAt: '' },
  ]);
  assert.equal(dupAttempt.allowed, false);
  assert.equal(dupAttempt.code, 'DUPLICATE_REGISTRATION');

  const fullEvent = { ...baseEvent, registeredCount: 100 };
  const capAttempt = canRegisterForEvent(fullEvent, subscriberUser, []);
  assert.equal(capAttempt.allowed, false);
  assert.equal(capAttempt.code, 'EVENT_FULL');
});

test('FR-15 & RM-08: Messaging requires active subscription, accepted connection, and no block', () => {
  const pendingCheck = canMessageRecipient(
    subscriberUser,
    'u-2',
    [{ id: 'c1', senderId: 'u-sub', recipientId: 'u-2', introMessage: '', status: 'pending', createdAt: '', updatedAt: '' }],
    []
  );
  assert.equal(pendingCheck.allowed, false);
  assert.equal(pendingCheck.code, 'CONNECTION_REQUIRED');

  const acceptedCheck = canMessageRecipient(
    subscriberUser,
    'u-2',
    [{ id: 'c1', senderId: 'u-sub', recipientId: 'u-2', introMessage: '', status: 'accepted', createdAt: '', updatedAt: '' }],
    []
  );
  assert.equal(acceptedCheck.allowed, true);

  const blockedCheck = canMessageRecipient(
    subscriberUser,
    'u-2',
    [{ id: 'c1', senderId: 'u-sub', recipientId: 'u-2', introMessage: '', status: 'accepted', createdAt: '', updatedAt: '' }],
    [{ id: 'b1', blockerId: 'u-2', blockedId: 'u-sub', createdAt: '' }]
  );
  assert.equal(blockedCheck.allowed, false);
  assert.equal(blockedCheck.code, 'USER_BLOCKED');
});

test('RM-03: Monthly and Annual subscription end dates compute cleanly', () => {
  const base = new Date('2026-01-15T12:00:00.000Z');
  const monthly = computeSubscriptionDates('monthly', base);
  const annual = computeSubscriptionDates('annual', base);
  assert.equal(monthly.endIso.startsWith('2026-02-15'), true);
  assert.equal(annual.endIso.startsWith('2027-01-15'), true);
});
