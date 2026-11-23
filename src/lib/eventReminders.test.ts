import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFavoriteReminderSchedule,
  buildReminderKey,
  buildReminderNotificationPayload,
  pruneSentReminders,
  REMINDER_LEAD_MINUTES,
} from './eventReminders';
import type { BusinessEvent } from '../types/domain';

const sampleEvents: BusinessEvent[] = [
  {
    id: 'evt-soon',
    organizerId: 'u-admin',
    organizerName: 'AfricaEnt',
    title: 'Dakar Fintech Breakfast',
    publicSummary: 'Session matinale',
    fullDescription: 'Description complète',
    dateIso: '2026-11-21T10:00:00.000Z',
    country: 'Sénégal',
    city: 'Dakar',
    sector: 'Fintech',
    format: 'in_person',
    venueAddress: 'Corniche',
    virtualLink: '',
    capacity: 50,
    registeredCount: 30,
    feeEur: 0,
    status: 'published',
  },
  {
    id: 'evt-later',
    organizerId: 'u-admin',
    organizerName: 'AfricaEnt',
    title: 'Paris Diaspora Deal-Room',
    publicSummary: 'Rencontres',
    fullDescription: 'Description complète',
    dateIso: '2026-11-21T16:00:00.000Z',
    country: 'France',
    city: 'Paris',
    sector: 'Capital-Risque',
    format: 'hybrid',
    venueAddress: 'Haussmann',
    virtualLink: '',
    capacity: 80,
    registeredCount: 40,
    feeEur: 20,
    status: 'published',
  },
  {
    id: 'evt-non-fav',
    organizerId: 'u-admin',
    organizerName: 'AfricaEnt',
    title: 'Lagos Ignored Event',
    publicSummary: 'Non favori',
    fullDescription: 'Description',
    dateIso: '2026-11-21T09:45:00.000Z',
    country: 'Nigeria',
    city: 'Lagos',
    sector: 'Fintech',
    format: 'virtual',
    venueAddress: 'Online',
    virtualLink: 'https://example.com',
    capacity: 100,
    registeredCount: 20,
    feeEur: 0,
    status: 'published',
  },
];

test('buildFavoriteReminderSchedule triggers dueNow at T-30min for favorite events only', () => {
  const nowMs = new Date('2026-11-21T09:30:00.000Z').getTime(); // exactly 30 min before evt-soon
  const schedule = buildFavoriteReminderSchedule(
    sampleEvents,
    ['evt-soon', 'evt-later'],
    {},
    nowMs,
    REMINDER_LEAD_MINUTES
  );

  assert.equal(schedule.dueNow.length, 1);
  assert.equal(schedule.dueNow[0].event.id, 'evt-soon');
  assert.equal(schedule.dueNow[0].minutesRemaining, 30);

  assert.equal(schedule.upcoming.length, 1);
  assert.equal(schedule.upcoming[0].event.id, 'evt-later');
  assert.equal(
    schedule.nextTriggerMs,
    new Date('2026-11-21T15:30:00.000Z').getTime()
  );
});

test('buildFavoriteReminderSchedule suppresses duplicate alerts once recorded in sentMap', () => {
  const nowMs = new Date('2026-11-21T09:40:00.000Z').getTime();
  const key = buildReminderKey('evt-soon', '2026-11-21T10:00:00.000Z', 30);
  const schedule = buildFavoriteReminderSchedule(
    sampleEvents,
    ['evt-soon', 'evt-later'],
    { [key]: nowMs - 60_000 },
    nowMs,
    30
  );

  assert.equal(schedule.dueNow.length, 0);
  assert.equal(schedule.upcoming.length, 1);
});

test('pruneSentReminders removes keys more than 24h after event start and keeps active ones', () => {
  const nowMs = new Date('2026-11-23T12:00:00.000Z').getTime();
  const staleKey = buildReminderKey('evt-soon', '2026-11-21T10:00:00.000Z', 30);
  const futureKey = buildReminderKey('evt-future', '2026-11-24T10:00:00.000Z', 30);

  const eventsWithFuture: BusinessEvent[] = [
    ...sampleEvents,
    {
      ...sampleEvents[0],
      id: 'evt-future',
      dateIso: '2026-11-24T10:00:00.000Z',
    },
  ];

  const pruned = pruneSentReminders(
    { [staleKey]: nowMs - 100_000, [futureKey]: nowMs - 10_000 },
    eventsWithFuture,
    nowMs
  );

  assert.equal(pruned[staleKey], undefined);
  assert.ok(pruned[futureKey]);
});

test('buildReminderNotificationPayload generates localized title, body, tag, and deep-link URL', () => {
  const payloadFr = buildReminderNotificationPayload(sampleEvents[0], 30, 'fr');
  assert.match(payloadFr.title, /Dans 30 min · Dakar Fintech Breakfast/);
  assert.match(payloadFr.body, /Dakar, Sénégal/);
  assert.equal(payloadFr.data.url, '/?eventId=evt-soon');

  const payloadEn = buildReminderNotificationPayload(sampleEvents[0], 25, 'en');
  assert.match(payloadEn.title, /Starts in 25 min · Dakar Fintech Breakfast/);
  assert.equal(payloadEn.tag, 'ae-fav-reminder-evt-soon-30');
});
