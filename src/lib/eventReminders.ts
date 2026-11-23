import type { BusinessEvent } from '../types/domain';
import type { AppLanguage } from './i18n';

export const REMINDER_LEAD_MINUTES = 30;
export const DEFAULT_REMINDER_LEAD_MS = REMINDER_LEAD_MINUTES * 60 * 1000;

export type SentReminderMap = Record<string, number>;

export interface ScheduledEventReminder {
  event: BusinessEvent;
  reminderKey: string;
  eventStartMs: number;
  triggerAtMs: number;
  minutesRemaining: number;
  msUntilTrigger: number;
  msUntilStart: number;
}

export interface ReminderScheduleResult {
  dueNow: ScheduledEventReminder[];
  upcoming: ScheduledEventReminder[];
  nextTriggerMs: number | null;
}

export interface LocalReminderNotificationPayload {
  eventId: string;
  reminderKey: string;
  title: string;
  body: string;
  tag: string;
  icon: string;
  badge: string;
  triggerAtMs: number;
  data: {
    eventId: string;
    reminderKey: string;
    url: string;
  };
}

export function buildReminderKey(
  eventId: string,
  dateIso: string,
  leadMinutes = REMINDER_LEAD_MINUTES
): string {
  return `${eventId}::${dateIso}::${leadMinutes}m`;
}

export function buildFavoriteReminderSchedule(
  events: BusinessEvent[],
  favoriteEventIds: string[],
  sentMap: SentReminderMap,
  nowMs = Date.now(),
  leadMinutes = REMINDER_LEAD_MINUTES
): ReminderScheduleResult {
  const favSet = new Set(favoriteEventIds);
  const leadMs = Math.max(1, leadMinutes) * 60 * 1000;
  const dueNow: ScheduledEventReminder[] = [];
  const upcoming: ScheduledEventReminder[] = [];

  for (const event of events) {
    if (!favSet.has(event.id) || event.status !== 'published') continue;

    const eventStartMs = new Date(event.dateIso).getTime();
    if (!Number.isFinite(eventStartMs)) continue;

    // Event already started
    if (eventStartMs <= nowMs) continue;

    const triggerAtMs = eventStartMs - leadMs;
    const reminderKey = buildReminderKey(event.id, event.dateIso, leadMinutes);
    const msUntilStart = eventStartMs - nowMs;
    const msUntilTrigger = triggerAtMs - nowMs;
    const minutesRemaining = Math.max(1, Math.round(msUntilStart / 60_000));

    const entry: ScheduledEventReminder = {
      event,
      reminderKey,
      eventStartMs,
      triggerAtMs,
      minutesRemaining,
      msUntilTrigger,
      msUntilStart,
    };

    if (nowMs >= triggerAtMs) {
      if (!sentMap[reminderKey]) {
        dueNow.push(entry);
      }
    } else {
      upcoming.push(entry);
    }
  }

  dueNow.sort((a, b) => a.eventStartMs - b.eventStartMs);
  upcoming.sort((a, b) => a.triggerAtMs - b.triggerAtMs);

  return {
    dueNow,
    upcoming,
    nextTriggerMs: upcoming.length > 0 ? upcoming[0].triggerAtMs : null,
  };
}

export function pruneSentReminders(
  sentMap: SentReminderMap,
  events: BusinessEvent[],
  nowMs = Date.now(),
  retentionAfterStartMs = 24 * 60 * 60 * 1000
): SentReminderMap {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const cleaned: SentReminderMap = {};

  for (const [key, sentAt] of Object.entries(sentMap)) {
    const [eventId] = key.split('::');
    const ev = eventById.get(eventId);
    if (!ev) continue;
    const startMs = new Date(ev.dateIso).getTime();
    if (!Number.isFinite(startMs)) continue;
    if (nowMs - startMs <= retentionAfterStartMs) {
      cleaned[key] = sentAt;
    }
  }

  return cleaned;
}

export function buildReminderNotificationPayload(
  event: BusinessEvent,
  minutesRemaining = REMINDER_LEAD_MINUTES,
  lang: AppLanguage = 'fr',
  leadMinutes = REMINDER_LEAD_MINUTES
): LocalReminderNotificationPayload {
  const startDate = new Date(event.dateIso);
  const timeText = Number.isFinite(startDate.getTime())
    ? startDate.toLocaleTimeString(lang === 'en' ? 'en-US' : 'fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const location = [event.city, event.country].filter(Boolean).join(', ');
  const reminderKey = buildReminderKey(event.id, event.dateIso, leadMinutes);

  const title =
    lang === 'en'
      ? `Starts in ${minutesRemaining} min · ${event.title}`
      : `Dans ${minutesRemaining} min · ${event.title}`;

  const body =
    lang === 'en'
      ? `Begins at ${timeText}${location ? ` · ${location}` : ''} · Saved favorite event`
      : `Début à ${timeText}${location ? ` · ${location}` : ''} · Événement favori`;

  return {
    eventId: event.id,
    reminderKey,
    title,
    body,
    tag: `ae-fav-reminder-${event.id}-${leadMinutes}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    triggerAtMs: Math.max(0, startDate.getTime() - leadMinutes * 60_000),
    data: {
      eventId: event.id,
      reminderKey,
      url: `/?eventId=${encodeURIComponent(event.id)}`,
    },
  };
}
