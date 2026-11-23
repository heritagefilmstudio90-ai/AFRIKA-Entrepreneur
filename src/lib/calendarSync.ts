import type { BusinessEvent, CalendarSyncScope, EventRegistration } from '../types/domain';

export interface CalendarSyncSelectionParams {
  events: BusinessEvent[];
  registrations: EventRegistration[];
  favoriteEventIds: string[];
  scope: CalendarSyncScope;
}

export function selectEventsForCalendarSync({
  events,
  registrations,
  favoriteEventIds,
  scope,
}: CalendarSyncSelectionParams): Array<{ event: BusinessEvent; registration?: EventRegistration }> {
  const activeRegs = new Map<string, EventRegistration>();
  for (const reg of registrations) {
    if (reg.status === 'confirmed') {
      activeRegs.set(reg.eventId, reg);
    }
  }
  const favSet = new Set(favoriteEventIds);

  const selected: Array<{ event: BusinessEvent; registration?: EventRegistration }> = [];
  for (const ev of events) {
    const reg = activeRegs.get(ev.id);
    const isFav = favSet.has(ev.id);
    if (scope === 'registered_only' && !reg) continue;
    if (scope === 'favorites_only' && !isFav) continue;
    if (scope === 'all_saved' && !reg && !isFav) continue;
    selected.push({ event: ev, registration: reg });
  }
  return selected;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcsUtcDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) payload compatible with
 * Apple Calendar (iOS/macOS) and Android Calendar (Google/Samsung/DAVx5)
 * including offline 1-hour VALARM reminders.
 */
export function buildIcsCalendar(
  items: Array<{ event: BusinessEvent; registration?: EventRegistration }>,
  options?: { calendarName?: string; now?: Date }
): string {
  const calendarName = options?.calendarName || 'Africa Entrepreneur — Mon Agenda';
  const dtStamp = formatIcsUtcDate(options?.now || new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Africa Entrepreneur//Offline Agenda Sync 1.0//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const { event, registration } of items) {
    const start = new Date(event.dateIso);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

    const location = event.locked
      ? `${event.city}, ${event.country}`
      : event.venueAddress
        ? `${event.venueAddress}, ${event.city}, ${event.country}`
        : `${event.city}, ${event.country}`;

    const descParts: string[] = [event.publicSummary];
    if (!event.locked && event.fullDescription) {
      descParts.push(event.fullDescription);
    }
    if (registration) {
      descParts.push(
        `Inscription confirmée (${registration.sessionSlot || 'Plénière'}) — Code : ${registration.confirmationCode}`
      );
    }
    if (!event.locked && event.virtualLink) {
      descParts.push(`Lien d'accès : ${event.virtualLink}`);
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@africaentrepreneur.app`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${formatIcsUtcDate(start)}`);
    lines.push(`DTEND:${formatIcsUtcDate(end)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    lines.push(`LOCATION:${escapeIcsText(location)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`);
    lines.push(`CATEGORIES:${escapeIcsText(event.sector)}`);
    lines.push('STATUS:CONFIRMED');
    if (!event.locked && event.virtualLink) {
      lines.push(`URL:${event.virtualLink}`);
    }
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeIcsText(`Rappel : ${event.title}`)}`);
    lines.push('TRIGGER:-PT1H');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export type EventAvailabilityStatus = 'full' | 'limited' | 'open';

export interface EventAvailabilityInfo {
  status: EventAvailabilityStatus;
  remainingSeats: number;
  labelFr: string;
  labelEn: string;
}

/**
 * Computes event registration availability from total capacity and current registered count:
 * - 'Complet' when remaining seats <= 0
 * - 'Places limitées' when remaining seats <= 15 or <= 30% of capacity
 * - 'Ouvert aux inscriptions' otherwise
 */
export function getEventAvailabilityStatus(
  event: Pick<BusinessEvent, 'capacity' | 'registeredCount'>
): EventAvailabilityInfo {
  const safeCapacity = Math.max(0, Number.isFinite(event.capacity) ? event.capacity : 0);
  const safeRegistered = Math.max(0, Number.isFinite(event.registeredCount) ? event.registeredCount : 0);
  const remainingSeats = Math.max(0, safeCapacity - safeRegistered);

  if (safeCapacity === 0 || remainingSeats <= 0) {
    return {
      status: 'full',
      remainingSeats: 0,
      labelFr: 'Complet',
      labelEn: 'Full',
    };
  }

  if (remainingSeats <= 15 || remainingSeats / safeCapacity <= 0.3) {
    return {
      status: 'limited',
      remainingSeats,
      labelFr: 'Places limitées',
      labelEn: 'Limited seats',
    };
  }

  return {
    status: 'open',
    remainingSeats,
    labelFr: 'Ouvert aux inscriptions',
    labelEn: 'Open for registration',
  };
}

export function buildIcsFilename(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `africa-entrepreneur-${slug || 'evenement'}.ics`;
}

