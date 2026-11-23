/* Service Worker Background Local Notification Scheduler for Africa Entrepreneur
 * Alerts users 30 minutes before saved favorite events start, even when backgrounded.
 */

const SW_DB_NAME = 'ae_sw_notifications_db';
const SW_STORE_NAME = 'state';
const SW_STATE_KEY = 'favorite_reminders_state';
const MAX_TIMEOUT_MS = 2147483647;

let nextTimerId = null;

function openSwDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
        db.createObjectStore(SW_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSwState() {
  try {
    const db = await openSwDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(SW_STORE_NAME, 'readonly');
      const req = tx.objectStore(SW_STORE_NAME).get(SW_STATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeSwState(state) {
  try {
    const db = await openSwDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SW_STORE_NAME, 'readwrite');
      tx.objectStore(SW_STORE_NAME).put(state, SW_STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB storage failures
  }
}

function buildSwReminderKey(eventId, dateIso, leadMinutes) {
  return `${eventId}::${dateIso}::${leadMinutes}m`;
}

function formatEventTime(dateIso, lang) {
  const d = new Date(dateIso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function broadcastToClients(message) {
  try {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const client of allClients) {
      client.postMessage(message);
    }
  } catch {
    // Ignore client broadcast errors
  }
}

async function cancelStaleScheduledTriggers(activeTags) {
  try {
    const existing = await self.registration.getNotifications({ includeTriggered: true });
    for (const notif of existing) {
      if (notif.tag && notif.tag.startsWith('ae-fav-reminder-') && !activeTags.has(notif.tag)) {
        notif.close();
      }
    }
  } catch {
    // includeTriggered is optional across browsers
  }
}

async function scheduleTimestampTriggersIfSupported(state) {
  const supportsShowTrigger =
    typeof Notification !== 'undefined' &&
    'showTrigger' in Notification.prototype &&
    typeof TimestampTrigger !== 'undefined';

  if (!state || !state.enabled) {
    await cancelStaleScheduledTriggers(new Set());
    return;
  }
  if (!supportsShowTrigger) return;

  const now = Date.now();
  const leadMinutes = Number(state.leadMinutes || 30);
  const leadMs = leadMinutes * 60 * 1000;
  const events = Array.isArray(state.events) ? state.events : [];
  const sentMap = state.sentMap || {};
  const activeTags = new Set();

  for (const ev of events) {
    const startMs = new Date(ev.dateIso).getTime();
    if (!Number.isFinite(startMs) || startMs <= now) continue;
    const triggerAtMs = startMs - leadMs;
    const reminderKey = buildSwReminderKey(ev.id, ev.dateIso, leadMinutes);
    if (triggerAtMs <= now || sentMap[reminderKey]) continue;

    const tag = `ae-fav-reminder-${ev.id}-${leadMinutes}`;
    activeTags.add(tag);
    const timeText = formatEventTime(ev.dateIso, state.lang);
    const location = [ev.city, ev.country].filter(Boolean).join(', ');

    try {
      await self.registration.showNotification(
        state.lang === 'en'
          ? `Starts in ${leadMinutes} min · ${ev.title}`
          : `Dans ${leadMinutes} min · ${ev.title}`,
        {
          body:
            state.lang === 'en'
              ? `Begins at ${timeText}${location ? ` · ${location}` : ''} · Saved favorite event`
              : `Début à ${timeText}${location ? ` · ${location}` : ''} · Événement favori`,
          tag,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          renotify: false,
          requireInteraction: false,
          showTrigger: new TimestampTrigger(triggerAtMs),
          data: {
            eventId: ev.id,
            reminderKey,
            url: `/?eventId=${encodeURIComponent(ev.id)}`,
          },
        }
      );
    } catch {
      // Fallback timer will handle notification if showTrigger rejects
    }
  }

  await cancelStaleScheduledTriggers(activeTags);
}

async function evaluateAndNotify() {
  if (nextTimerId) {
    clearTimeout(nextTimerId);
    nextTimerId = null;
  }

  const state = await readSwState();
  if (!state || !state.enabled) return;

  const permissionOk =
    typeof Notification === 'undefined' ? true : Notification.permission === 'granted';
  if (!permissionOk) return;

  const now = Date.now();
  const leadMinutes = Number(state.leadMinutes || 30);
  const leadMs = leadMinutes * 60 * 1000;
  const events = Array.isArray(state.events) ? state.events : [];
  const sentMap = Object.assign({}, state.sentMap || {});
  let sentAny = false;
  let soonestFutureTriggerMs = null;

  for (const ev of events) {
    const startMs = new Date(ev.dateIso).getTime();
    if (!Number.isFinite(startMs) || startMs <= now) continue;

    const triggerAtMs = startMs - leadMs;
    const reminderKey = buildSwReminderKey(ev.id, ev.dateIso, leadMinutes);

    if (now >= triggerAtMs) {
      if (!sentMap[reminderKey]) {
        const minsLeft = Math.max(1, Math.round((startMs - now) / 60000));
        const timeText = formatEventTime(ev.dateIso, state.lang);
        const location = [ev.city, ev.country].filter(Boolean).join(', ');
        const title =
          state.lang === 'en'
            ? `Starts in ${minsLeft} min · ${ev.title}`
            : `Dans ${minsLeft} min · ${ev.title}`;
        const body =
          state.lang === 'en'
            ? `Begins at ${timeText}${location ? ` · ${location}` : ''} · Saved favorite event`
            : `Début à ${timeText}${location ? ` · ${location}` : ''} · Événement favori`;

        try {
          await self.registration.showNotification(title, {
            body,
            tag: `ae-fav-reminder-${ev.id}-${leadMinutes}`,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            vibrate: [180, 90, 180],
            data: {
              eventId: ev.id,
              reminderKey,
              url: `/?eventId=${encodeURIComponent(ev.id)}`,
            },
          });
          sentMap[reminderKey] = now;
          sentAny = true;

          await broadcastToClients({
            type: 'REMINDER_SENT',
            payload: {
              eventId: ev.id,
              eventTitle: ev.title,
              reminderKey,
              title,
              body,
              sentAt: now,
            },
          });
        } catch {
          // Ignore notification permission failure
        }
      }
    } else if (soonestFutureTriggerMs === null || triggerAtMs < soonestFutureTriggerMs) {
      soonestFutureTriggerMs = triggerAtMs;
    }
  }

  if (sentAny) {
    state.sentMap = sentMap;
    await writeSwState(state);
  }

  if (soonestFutureTriggerMs !== null) {
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(1000, soonestFutureTriggerMs - Date.now() + 250));
    nextTimerId = setTimeout(() => {
      evaluateAndNotify();
    }, delay);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(evaluateAndNotify());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SYNC_FAVORITE_REMINDERS') {
    const payload = data.payload || {};
    event.waitUntil(
      (async () => {
        const prev = (await readSwState()) || {};
        const mergedSent = Object.assign({}, prev.sentMap || {}, payload.sentMap || {});
        const nextState = {
          enabled: Boolean(payload.enabled),
          leadMinutes: Number(payload.leadMinutes || 30),
          lang: payload.lang === 'en' ? 'en' : 'fr',
          events: Array.isArray(payload.events) ? payload.events : [],
          sentMap: mergedSent,
          updatedAt: Date.now(),
        };
        await writeSwState(nextState);
        await scheduleTimestampTriggersIfSupported(nextState);
        await evaluateAndNotify();
      })()
    );
  } else if (data.type === 'CHECK_REMINDERS_NOW') {
    event.waitUntil(evaluateAndNotify());
  } else if (data.type === 'TRIGGER_TEST_REMINDER') {
    const p = data.payload || {};
    event.waitUntil(
      self.registration.showNotification(p.title || 'Dans 30 min · Rappel Africa Entrepreneur', {
        body: p.body || 'Notification locale active (arrière-plan et premier plan prêts).',
        tag: p.tag || `ae-test-reminder-${Date.now()}`,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [180, 90, 180],
        data: {
          eventId: p.eventId || '',
          url: p.eventId ? `/?eventId=${encodeURIComponent(p.eventId)}` : '/',
        },
      })
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'ae-favorite-event-reminders') {
    event.waitUntil(evaluateAndNotify());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'ae-favorite-event-reminders') {
    event.waitUntil(evaluateAndNotify());
  }
});

self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }

  if (payload && payload.title) {
    event.waitUntil(
      self.registration.showNotification(payload.title, {
        body: payload.body || '',
        tag: payload.tag || 'ae-push-reminder',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: payload.data || { url: '/' },
      })
    );
  } else {
    event.waitUntil(evaluateAndNotify());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/';
  const eventId = data.eventId || '';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'OPEN_EVENT_FROM_NOTIFICATION',
            eventId,
          });
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
