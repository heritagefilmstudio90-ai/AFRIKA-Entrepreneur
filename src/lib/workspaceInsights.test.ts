import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBadgeVcf,
  buildBadgesCsv,
  computeAdminMetrics,
  computeOrganizerMetrics,
  computeProfileCompleteness,
  computeSubscriptionComparison,
  verifyTicketCodeMatch,
} from './workspaceInsights.ts';
import type {
  BusinessEvent,
  EnterprisePage,
  EventParticipantSummary,
  MemberAccount,
  ModerationReport,
  PaymentRecord,
  ScannedBadgeContact,
} from '../types/domain.ts';

test('computeProfileCompleteness calculates percentage and lists missing labels accurately', () => {
  const partial = computeProfileCompleteness({
    fullName: 'Amina Diallo',
    headline: 'Fondatrice Fintech',
    bio: 'Courte bio',
    city: 'Dakar',
    country: 'Sénégal',
    sectors: ['Fintech'],
    skills: [],
    activeCountries: ['Sénégal'],
    collaborationNeeds: [],
    enterpriseName: 'PayTeranga',
    enterpriseSector: 'Fintech',
    voicePitchDataUrl: '',
  });

  assert.equal(partial.totalCount, 10);
  assert.equal(partial.completedCount, 6);
  assert.equal(partial.scorePct, 60);
  assert.deepEqual(partial.missingLabels, [
    'Biographie (20+ car.)',
    'Compétences clés',
    'Collaborations recherchées',
    'Pitch vocal',
  ]);
});

test('buildBadgesCsv and buildBadgeVcf format OCR badges properly', () => {
  const badge: ScannedBadgeContact = {
    id: 'b-1',
    fullName: 'Moussa Ndiaye',
    headline: 'CEO',
    companyName: 'Teranga "SAS"',
    sector: 'Fintech',
    email: 'moussa@teranga.sn',
    phone: '+221 77 555 01 99',
    city: 'Dakar',
    country: 'Sénégal',
    linkedinUrl: 'https://linkedin.com/in/moussa',
    eventTitle: 'Dakar Business Summit',
    rawText: 'Moussa Ndiaye',
    createdAt: '2026-11-20T10:00:00.000Z',
  };

  const csv = buildBadgesCsv([badge]);
  assert.match(csv, /^"Nom complet"/);
  assert.match(csv, /"Teranga ""SAS"""/);
  assert.match(csv, /"moussa@teranga\.sn"/);

  const vcf = buildBadgeVcf(badge);
  assert.match(vcf, /^BEGIN:VCARD/);
  assert.match(vcf, /FN:Moussa Ndiaye/);
  assert.match(vcf, /EMAIL;TYPE=INTERNET:moussa@teranga\.sn/);
  assert.match(vcf, /END:VCARD$/);
});

test('computeSubscriptionComparison computes annual monthly rate and savings', () => {
  const cmp = computeSubscriptionComparison(12, 99);
  assert.equal(cmp.annualEffectiveMonthlyEur, 8.25);
  assert.equal(cmp.yearlySavingsEur, 45);
  assert.equal(cmp.yearlySavingsPct, 31);
});

test('computeOrganizerMetrics and verifyTicketCodeMatch handle capacities, fees, and tickets', () => {
  const events: BusinessEvent[] = [
    {
      id: 'e1',
      organizerId: 'org-1',
      organizerName: 'AE',
      title: 'Summit A',
      country: 'Sénégal',
      city: 'Dakar',
      sector: 'Fintech',
      format: 'hybrid',
      dateIso: '2026-12-10T09:00:00.000Z',
      publicSummary: 'A',
      fullDescription: 'AA',
      venueAddress: 'Dakar',
      virtualLink: '',
      capacity: 100,
      registeredCount: 75,
      feeEur: 20,
      status: 'published',
    },
    {
      id: 'e2',
      organizerId: 'org-1',
      organizerName: 'AE',
      title: 'Summit B',
      country: 'France',
      city: 'Paris',
      sector: 'Tech',
      format: 'virtual',
      dateIso: '2026-12-20T09:00:00.000Z',
      publicSummary: 'B',
      fullDescription: 'BB',
      venueAddress: 'Paris',
      virtualLink: 'https://meet.ae',
      capacity: 100,
      registeredCount: 25,
      feeEur: 0,
      status: 'draft',
    },
  ];

  const metrics = computeOrganizerMetrics(events);
  assert.equal(metrics.totalEvents, 2);
  assert.equal(metrics.publishedCount, 1);
  assert.equal(metrics.totalCapacity, 200);
  assert.equal(metrics.totalRegistered, 100);
  assert.equal(metrics.fillRatePct, 50);
  assert.equal(metrics.estimatedRevenueEur, 1500);

  const participants: EventParticipantSummary[] = [
    {
      registrationId: 'r1',
      memberId: 'm1',
      fullName: 'Amina Diallo',
      email: 'amina@ae.com',
      city: 'Dakar',
      country: 'Sénégal',
      confirmationCode: 'AE-9042',
      status: 'confirmed',
      createdAt: '2026-11-20T10:00:00.000Z',
    },
  ];

  assert.equal(verifyTicketCodeMatch(participants, 'ae-9042')?.fullName, 'Amina Diallo');
  assert.equal(verifyTicketCodeMatch(participants, 'AE-0000'), null);
});

test('computeAdminMetrics aggregates revenue, active subscribers, verified enterprises and open reports', () => {
  const members = [
    { id: 'm1', subscriptionStatus: 'active' },
    { id: 'm2', subscriptionStatus: 'none' },
  ] as MemberAccount[];
  const enterprises = [
    { id: 'ent1', verified: true },
    { id: 'ent2', verified: false },
  ] as EnterprisePage[];
  const events = [
    { id: 'ev1', status: 'published' },
    { id: 'ev2', status: 'suspended' },
  ] as BusinessEvent[];
  const payments = [
    { id: 'p1', amountEur: 99, status: 'succeeded' },
    { id: 'p2', amountEur: 12, status: 'failed' },
  ] as PaymentRecord[];
  const reports = [
    { id: 'rep1', status: 'open' },
    { id: 'rep2', status: 'resolved' },
  ] as ModerationReport[];

  const admin = computeAdminMetrics({ members, enterprises, events, payments, reports });
  assert.equal(admin.totalRevenueEur, 99);
  assert.equal(admin.activeSubscribersCount, 1);
  assert.equal(admin.verifiedEnterprisesCount, 1);
  assert.equal(admin.totalEnterprisesCount, 2);
  assert.equal(admin.openReportsCount, 1);
  assert.equal(admin.publishedEventsCount, 1);
});
