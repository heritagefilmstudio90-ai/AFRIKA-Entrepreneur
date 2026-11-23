import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIcsCalendar,
  buildIcsFilename,
  getEventAvailabilityStatus,
  selectEventsForCalendarSync,
} from './calendarSync';
import type { BusinessEvent, EventRegistration } from '../types/domain';

const events: BusinessEvent[] = [
  {
    id: 'evt-dakar',
    organizerId: 'u-orga',
    organizerName: 'PayTeranga',
    title: 'Dakar Business Summit 2026',
    publicSummary: 'Rencontres fondateurs, investisseurs et Fintech.',
    fullDescription: 'Programme complet réservé aux abonnés.',
    dateIso: '2026-12-14T09:00:00.000Z',
    country: 'Sénégal',
    city: 'Dakar',
    sector: 'Fintech',
    format: 'hybrid',
    venueAddress: 'CICAD Diamniadio',
    virtualLink: 'https://meet.africaentrepreneur.app/dakar',
    capacity: 120,
    registeredCount: 85,
    feeEur: 0,
    status: 'published',
    locked: false,
  },
  {
    id: 'evt-paris',
    organizerId: 'u-orga',
    organizerName: 'Diaspora Partners',
    title: 'Forum Diaspora Paris',
    publicSummary: 'Table ronde capital-risque.',
    fullDescription: 'SECRET_LOCKED_DETAIL',
    dateIso: '2026-12-22T17:30:00.000Z',
    country: 'France',
    city: 'Paris',
    sector: 'Capital-Risque',
    format: 'in_person',
    venueAddress: 'SECRET_ADDRESS',
    virtualLink: 'https://secret.example',
    capacity: 80,
    registeredCount: 30,
    feeEur: 25,
    status: 'published',
    locked: true,
  },
];

const registrations: EventRegistration[] = [
  {
    id: 'reg-1',
    eventId: 'evt-dakar',
    memberId: 'u-amina',
    status: 'confirmed',
    confirmationCode: 'AE-DKR-8421',
    sessionSlot: 'Plénière',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
];

test('selectEventsForCalendarSync deduplicates confirmed registrations and favorites per scope', () => {
  const allSaved = selectEventsForCalendarSync({
    events,
    registrations,
    favoriteEventIds: ['evt-dakar', 'evt-paris'],
    scope: 'all_saved',
  });
  assert.equal(allSaved.length, 2);
  assert.equal(allSaved[0].registration?.confirmationCode, 'AE-DKR-8421');

  const regOnly = selectEventsForCalendarSync({
    events,
    registrations,
    favoriteEventIds: ['evt-dakar', 'evt-paris'],
    scope: 'registered_only',
  });
  assert.equal(regOnly.length, 1);
  assert.equal(regOnly[0].event.id, 'evt-dakar');

  const favOnly = selectEventsForCalendarSync({
    events,
    registrations,
    favoriteEventIds: ['evt-paris'],
    scope: 'favorites_only',
  });
  assert.equal(favOnly.length, 1);
  assert.equal(favOnly[0].event.id, 'evt-paris');
});

test('buildIcsCalendar generates valid RFC 5545 VCALENDAR with VALARM and hides locked details', () => {
  const items = selectEventsForCalendarSync({
    events,
    registrations,
    favoriteEventIds: ['evt-paris'],
    scope: 'all_saved',
  });
  const ics = buildIcsCalendar(items, { now: new Date('2026-11-20T12:00:00.000Z') });

  assert.ok(ics.includes('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('UID:evt-dakar@africaentrepreneur.app\r\n'));
  assert.ok(ics.includes('DTSTART:20261214T090000Z\r\n'));
  assert.ok(ics.includes('DTEND:20261214T110000Z\r\n'));
  assert.ok(ics.includes('AE-DKR-8421'));
  assert.ok(ics.includes('BEGIN:VALARM\r\n'));
  assert.ok(ics.includes('TRIGGER:-PT1H\r\n'));

  // Locked event details must never leak into exported calendar
  assert.equal(ics.includes('SECRET_LOCKED_DETAIL'), false);
  assert.equal(ics.includes('SECRET_ADDRESS'), false);
  assert.equal(ics.includes('https://secret.example'), false);
});

test('getEventAvailabilityStatus classifies full, limited, and open events accurately', () => {
  const full = getEventAvailabilityStatus({ capacity: 80, registeredCount: 80 });
  assert.equal(full.status, 'full');
  assert.equal(full.remainingSeats, 0);
  assert.equal(full.labelFr, 'Complet');

  const overBooked = getEventAvailabilityStatus({ capacity: 50, registeredCount: 55 });
  assert.equal(overBooked.status, 'full');
  assert.equal(overBooked.remainingSeats, 0);

  // 35 remaining out of 120 = 29.1% <= 30% -> limited
  const limitedRatio = getEventAvailabilityStatus({ capacity: 120, registeredCount: 85 });
  assert.equal(limitedRatio.status, 'limited');
  assert.equal(limitedRatio.remainingSeats, 35);
  assert.equal(limitedRatio.labelFr, 'Places limitées');

  // 12 remaining out of 100 <= 15 seats -> limited
  const limitedSeats = getEventAvailabilityStatus({ capacity: 100, registeredCount: 88 });
  assert.equal(limitedSeats.status, 'limited');
  assert.equal(limitedSeats.remainingSeats, 12);

  // 88 remaining out of 200 = 44% -> open
  const openEvent = getEventAvailabilityStatus({ capacity: 200, registeredCount: 112 });
  assert.equal(openEvent.status, 'open');
  assert.equal(openEvent.remainingSeats, 88);
  assert.equal(openEvent.labelFr, 'Ouvert aux inscriptions');
});

test('buildIcsFilename creates clean sanitized .ics filenames and single-event ICS exports', () => {
  assert.equal(
    buildIcsFilename('Dakar Business Summit 2026 — Édition Spéciale!'),
    'africa-entrepreneur-dakar-business-summit-2026-edition-speciale.ics'
  );
  assert.equal(buildIcsFilename('   '), 'africa-entrepreneur-evenement.ics');

  const singleIcs = buildIcsCalendar([{ event: events[0] }], {
    calendarName: `Africa Entrepreneur — ${events[0].title}`,
    now: new Date('2026-11-20T12:00:00.000Z'),
  });
  assert.ok(singleIcs.includes('SUMMARY:Dakar Business Summit 2026\r\n'));
  assert.ok(singleIcs.includes('LOCATION:CICAD Diamniadio\\, Dakar\\, Sénégal\r\n'));
});

