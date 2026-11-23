import type { BusinessEvent } from '../types/domain';
import {
  REMINDER_LEAD_MINUTES,
  buildReminderNotificationPayload,
  pruneSentReminders,
  type LocalReminderNotificationPayload,
  type SentReminderMap,
} from './eventReminders';
import type { AppLanguage } from './i18n';

const REMINDER_PREFS_KEY = 'ae_reminder_prefs';
const SENT_REMINDERS_KEY = 'ae_sent_reminders';

export interface ReminderPreferences {
  enabled: boolean;
  leadMinutes: number;
}

export interface NotificationCapability {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  serviceWorkerReady: boolean;
  supportsTimestampTrigger: boolean;
  supportsPeriodicSync: boolean;
}

export interface SwSentReminderEvent {
  eventId: string;
  eventTitle?: string;
  reminderKey: string;
  title: string;
  body: string;
  sentAt: number;
}

export function readReminderPrefs(): ReminderPreferences {
  try {
    const raw = localStorage.getItem(REMINDER_PREFS_KEY);
    if (!raw) return { enabled: true, leadMinutes: REMINDER_LEAD_MINUTES };
    const parsed = JSON.parse(raw) as Partial<ReminderPreferences>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      leadMinutes:
        typeof parsed.leadMinutes === 'number' && parsed.leadMinutes > 0
          ? parsed.leadMinutes
          : REMINDER_LEAD_MINUTES,
    };
  } catch {
    return { enabled: true, leadMinutes: REMINDER_LEAD_MINUTES };
  }
}

export function writeReminderPrefs(prefs: ReminderPreferences): void {
  try {
    localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function readSentReminders(events?: BusinessEvent[]): SentReminderMap {
  try {
    const raw = localStorage.getItem(SENT_REMINDERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SentReminderMap;
    if (!parsed || typeof parsed !== 'object') return {};
    if (events && events.length > 0) {
      const cleaned = pruneSentReminders(parsed, events);
      if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
        writeSentReminders(cleaned);
      }
      return cleaned;
    }
    return parsed;
  } catch {
    return {};
  }
}

export function writeSentReminders(map: SentReminderMap): void {
  try {
    localStorage.setItem(SENT_REMINDERS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function markReminderSent(reminderKey: string, sentAt = Date.now()): SentReminderMap {
  const prev = readSentReminders();
  const next = { ...prev, [reminderKey]: sentAt };
  writeSentReminders(next);
  return next;
}

export function getNotificationCapability(): NotificationCapability {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      permission: 'unsupported',
      serviceWorkerReady: false,
      supportsTimestampTrigger: false,
      supportsPeriodicSync: false,
    };
  }

  const supported = 'Notification' in window;
  const permission: NotificationPermission | 'unsupported' = supported
    ? Notification.permission
    : 'unsupported';

  const supportsTimestampTrigger =
    supported &&
    'showTrigger' in Notification.prototype &&
    'TimestampTrigger' in window;

  const serviceWorkerReady =
    'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);

  const supportsPeriodicSync =
    'serviceWorker' in navigator &&
    typeof ServiceWorkerRegistration !== 'undefined' &&
    'periodicSync' in ServiceWorkerRegistration.prototype;

  return {
    supported,
    permission,
    serviceWorkerReady,
    supportsTimestampTrigger,
    supportsPeriodicSync,
  };
}

async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    return reg;
  } catch {
    return null;
  }
}

async function registerPeriodicReminderSync(reg: ServiceWorkerRegistration | null): Promise<void> {
  if (!reg) return;
  const regWithSync = reg as ServiceWorkerRegistration & {
    periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> };
    sync?: { register: (tag: string) => Promise<void> };
  };

  try {
    if (regWithSync.periodicSync) {
      await regWithSync.periodicSync.register('ae-favorite-event-reminders', {
        minInterval: 30 * 60 * 1000,
      });
    }
  } catch {
    // periodicSync requires installed PWA / site engagement in some browsers
  }

  try {
    if (regWithSync.sync) {
      await regWithSync.sync.register('ae-favorite-event-reminders');
    }
  } catch {
    // Background Sync optional
  }
}

export async function requestLocalNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      const reg = await getActiveServiceWorkerRegistration();
      await registerPeriodicReminderSync(reg);
    }
    return result;
  } catch {
    return Notification.permission;
  }
}

export async function syncFavoriteRemindersWithSW(params: {
  enabled: boolean;
  events: BusinessEvent[];
  favoriteEventIds: string[];
  lang: AppLanguage;
  leadMinutes?: number;
}): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

  const favSet = new Set(params.favoriteEventIds);
  const favoriteEvents = params.events
    .filter((ev) => favSet.has(ev.id) && ev.status === 'published')
    .map((ev) => ({
      id: ev.id,
      title: ev.title,
      dateIso: ev.dateIso,
      city: ev.city,
      country: ev.country,
      sector: ev.sector,
    }));

  const sentMap = readSentReminders(params.events);
  const message = {
    type: 'SYNC_FAVORITE_REMINDERS',
    payload: {
      enabled: params.enabled,
      leadMinutes: params.leadMinutes ?? REMINDER_LEAD_MINUTES,
      lang: params.lang,
      events: favoriteEvents,
      sentMap,
    },
  };

  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
    const reg = await getActiveServiceWorkerRegistration();
    if (reg?.active && reg.active !== navigator.serviceWorker.controller) {
      reg.active.postMessage(message);
    }
    if (params.enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await registerPeriodicReminderSync(reg);
    }
    return Boolean(navigator.serviceWorker.controller || reg?.active);
  } catch {
    return false;
  }
}

export async function dispatchLocalNotification(
  payload: LocalReminderNotificationPayload
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: payload.body,
    tag: payload.tag,
    icon: payload.icon,
    badge: payload.badge,
    vibrate: [180, 90, 180],
    renotify: false,
    data: payload.data,
  };

  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(payload.title, options);
      return true;
    }
  } catch {
    // Fall back to direct Window Notification
  }

  try {
    new Notification(payload.title, options);
    return true;
  } catch {
    return false;
  }
}

export async function triggerTestFavoriteReminder(
  sampleEvent: BusinessEvent | undefined,
  lang: AppLanguage
): Promise<{ dispatched: boolean; payload: LocalReminderNotificationPayload }> {
  const targetEvent: BusinessEvent = sampleEvent || {
    id: 'test-reminder',
    organizerId: 'org-test',
    organizerName: 'Africa Entrepreneur',
    title: lang === 'en' ? 'Africa Fintech & Diaspora Forum' : 'Forum Fintech & Diaspora Dakar',
    publicSummary: '',
    fullDescription: '',
    dateIso: new Date(Date.now() + REMINDER_LEAD_MINUTES * 60_000).toISOString(),
    country: 'Sénégal',
    city: 'Dakar',
    sector: 'Fintech',
    format: 'hybrid',
    venueAddress: '',
    virtualLink: '',
    capacity: 120,
    registeredCount: 84,
    feeEur: 0,
    status: 'published',
  };

  const payload = buildReminderNotificationPayload(
    targetEvent,
    REMINDER_LEAD_MINUTES,
    lang,
    REMINDER_LEAD_MINUTES
  );
  payload.tag = `ae-test-reminder-${Date.now()}`;

  let dispatched = false;
  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg?.active) {
      reg.active.postMessage({
        type: 'TRIGGER_TEST_REMINDER',
        payload: {
          title: payload.title,
          body: payload.body,
          tag: payload.tag,
          eventId: sampleEvent?.id || '',
        },
      });
      dispatched = true;
    }
  } catch {
    dispatched = false;
  }

  if (!dispatched) {
    dispatched = await dispatchLocalNotification(payload);
  }

  return { dispatched, payload };
}

export function subscribeToServiceWorkerReminders(handlers: {
  onReminderSent?: (data: SwSentReminderEvent) => void;
  onOpenEvent?: (eventId: string) => void;
}): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const listener = (event: MessageEvent) => {
    const msg = event.data as { type?: string; payload?: SwSentReminderEvent; eventId?: string } | null;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'REMINDER_SENT' && msg.payload) {
      markReminderSent(msg.payload.reminderKey, msg.payload.sentAt);
      handlers.onReminderSent?.(msg.payload);
    } else if (msg.type === 'OPEN_EVENT_FROM_NOTIFICATION' && msg.eventId) {
      handlers.onOpenEvent?.(msg.eventId);
    }
  };

  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}
