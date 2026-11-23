import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Compass,
  CreditCard,
  Home,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { AdminView } from './components/AdminView';
import { AuthView } from './components/AuthView';
import { BadgeScannerModal } from './components/BadgeScannerModal';
import { BrandMark } from './components/BrandMark';
import { CatalogueView } from './components/CatalogueView';
import { DirectoryView } from './components/DirectoryView';
import { HomeView } from './components/HomeView';
import { MessagesView, type PeerSummary } from './components/MessagesView';
import { OrganizerView } from './components/OrganizerView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SubscriptionView } from './components/SubscriptionView';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  apiFetch,
  flushOfflineMutations,
  getSavedToken,
  queueOrSendMutation,
  saveToken,
  setCachedPrivateKeyJwk,
} from './lib/apiClient';
import { toggleFavoriteId } from './lib/catalogFilters';
import { mergeScannedBadgeList } from './lib/badgeOcr';
import { buildIcsCalendar, selectEventsForCalendarSync } from './lib/calendarSync';
import {
  REMINDER_LEAD_MINUTES,
  buildFavoriteReminderSchedule,
  buildReminderNotificationPayload,
} from './lib/eventReminders';
import { UI_COPY, readStoredLanguage, translateRole, type AppLanguage } from './lib/i18n';
import { localizeEvent, localizeNetwork, localizeNotification } from './lib/contentI18n';
import {
  buildLastSyncLabel,
  describeOfflineSyncOutcome,
  getOfflineQueue,
  readLastSyncTimestamp,
  readOfflineCache,
  saveLastSyncTimestamp,
  writeOfflineCache,
} from './lib/offlineSync';
import {
  dispatchLocalNotification,
  getNotificationCapability,
  markReminderSent,
  readReminderPrefs,
  readSentReminders,
  requestLocalNotificationPermission,
  subscribeToServiceWorkerReminders,
  syncFavoriteRemindersWithSW,
  triggerTestFavoriteReminder,
  writeReminderPrefs,
} from './lib/pushReminders';
import type {
  AppNotification,
  BusinessEvent,
  ContactConnection,
  EncryptedMessageRecord,
  EnterprisePage,
  EventRegistration,
  GroupMessage,
  MemberAccount,
  PaymentRecord,
  ProfessionalNetwork,
  ProfessionalProfile,
  ScannedBadgeContact,
  SubscriptionEventLog,
} from './types/domain';

type NavTab = 'home' | 'catalogue' | 'subscription' | 'directory' | 'messages' | 'organizer' | 'admin';

interface BlockedMemberSummary {
  id: string;
  blockedId: string;
  blockedName?: string;
  createdAt: string;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [lang, setLang] = useState<AppLanguage>(() => readStoredLanguage());
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ae_theme');
      if (saved === 'light') return false;
      return true;
    } catch {
      return true;
    }
  });
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [quickScannerOpen, setQuickScannerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [user, setUser] = useState<MemberAccount | null>(null);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [enterprise, setEnterprise] = useState<EnterprisePage | null>(null);
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [networks, setNetworks] = useState<ProfessionalNetwork[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [subscriptionLogs, setSubscriptionLogs] = useState<SubscriptionEventLog[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [blocks, setBlocks] = useState<BlockedMemberSummary[]>([]);
  const [visibilityStats, setVisibilityStats] = useState<{ profileViews: number; enterpriseViews: number }>({
    profileViews: 0,
    enterpriseViews: 0,
  });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [connections, setConnections] = useState<ContactConnection[]>([]);
  const [peers, setPeers] = useState<PeerSummary[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [realtimeMessages, setRealtimeMessages] = useState<EncryptedMessageRecord[]>([]);
  const [realtimeGroupMessages, setRealtimeGroupMessages] = useState<GroupMessage[]>([]);
  const [readReceiptSignal, setReadReceiptSignal] = useState<{ peerId: string; readAt: string } | null>(null);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string | null>(() =>
    readLastSyncTimestamp()
  );
  const [syncClockTick, setSyncClockTick] = useState<number>(() => Date.now());
  const [manualSyncing, setManualSyncing] = useState(false);
  const [manualSyncNotice, setManualSyncNotice] = useState<{
    status: 'synced' | 'partial' | 'offline' | 'up_to_date';
    text: string;
  } | null>(null);

  const [catalogueSector, setCatalogueSector] = useState<string>('all');
  const [catalogueEventId, setCatalogueEventId] = useState<string | undefined>(undefined);
  const [catalogueSearchQuery, setCatalogueSearchQuery] = useState<string>('');
  const [chatPeerId, setChatPeerId] = useState<string | null>(null);
  const [favoriteEventIds, setFavoriteEventIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('ae_guest_favorites');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [scannedBadges, setScannedBadges] = useState<ScannedBadgeContact[]>(() => {
    try {
      const raw = localStorage.getItem('ae_scanned_badges');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [favoriteReminderEnabled, setFavoriteReminderEnabled] = useState<boolean>(
    () => readReminderPrefs().enabled
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    () => getNotificationCapability().permission
  );
  const [localReminderNotifs, setLocalReminderNotifs] = useState<AppNotification[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const syncNoticeTimerRef = useRef<number | null>(null);
  const copy = UI_COPY[lang];

  const loadData = useCallback(async () => {
    const token = getSavedToken();
    try {
      const [evRes, netRes] = await Promise.all([
        apiFetch<{ events: BusinessEvent[] }>('/api/events'),
        apiFetch<{ networks: ProfessionalNetwork[] }>('/api/networks'),
      ]);
      setEvents(evRes.events);
      setNetworks(netRes.networks);
      await writeOfflineCache('events', evRes.events);
      await writeOfflineCache('networks', netRes.networks);
      setLastSuccessfulSyncAt(saveLastSyncTimestamp());
      setSyncClockTick(Date.now());

      if (token) {
        try {
          const meRes = await apiFetch<{
            user: MemberAccount;
            profile: ProfessionalProfile | null;
            enterprise: EnterprisePage | null;
            payments: PaymentRecord[];
            subscriptionLogs: SubscriptionEventLog[];
            registrations: EventRegistration[];
            blocks: BlockedMemberSummary[];
            visibilityStats: { profileViews: number; enterpriseViews: number };
            notifications: AppNotification[];
            onlineUsers: string[];
          }>('/api/me');
          setUser(meRes.user);
          setProfile(meRes.profile);
          setEnterprise(meRes.enterprise);
          setPayments(meRes.payments || []);
          setSubscriptionLogs(meRes.subscriptionLogs || []);
          setRegistrations(meRes.registrations || []);
          setBlocks(meRes.blocks || []);
          setVisibilityStats(meRes.visibilityStats || { profileViews: 0, enterpriseViews: 0 });
          setNotifications(meRes.notifications || []);
          setOnlineUsers(meRes.onlineUsers || []);
          if (typeof meRes.user.favoriteReminderEnabled === 'boolean') {
            setFavoriteReminderEnabled(meRes.user.favoriteReminderEnabled);
            writeReminderPrefs({
              enabled: meRes.user.favoriteReminderEnabled,
              leadMinutes: REMINDER_LEAD_MINUTES,
            });
          }
          const serverFavs = Array.isArray(meRes.user.favoriteEventIds) ? meRes.user.favoriteEventIds : [];
          setFavoriteEventIds(serverFavs);
          try {
            localStorage.setItem(`ae_user_favorites_${meRes.user.id}`, JSON.stringify(serverFavs));
          } catch {
            // Ignore storage quota errors
          }
          await writeOfflineCache('me', meRes);

          if (meRes.user.subscriptionStatus === 'active' || meRes.user.role === 'admin') {
            const connRes = await apiFetch<{ connections: ContactConnection[]; peers: PeerSummary[] }>(
              '/api/connections'
            );
            setConnections(connRes.connections);
            setPeers(connRes.peers);
            await writeOfflineCache('connections', connRes);
          } else {
            setConnections([]);
            setPeers([]);
          }

          try {
            const badgeRes = await apiFetch<{ badges: ScannedBadgeContact[] }>('/api/badges');
            if (Array.isArray(badgeRes.badges)) {
              setScannedBadges(badgeRes.badges);
              await writeOfflineCache('scanned_badges', badgeRes.badges);
              try {
                localStorage.setItem('ae_scanned_badges', JSON.stringify(badgeRes.badges));
              } catch {
                // Ignore storage quota
              }
            }
          } catch {
            // Keep locally cached badges if unavailable
          }
        } catch {
          saveToken(null);
          setUser(null);
        }
      } else {
        setUser(null);
        setProfile(null);
        setEnterprise(null);
        setPayments([]);
        setSubscriptionLogs([]);
        setRegistrations([]);
        setBlocks([]);
        setVisibilityStats({ profileViews: 0, enterpriseViews: 0 });
        setNotifications([]);
        setConnections([]);
        setPeers([]);
        try {
          const raw = localStorage.getItem('ae_guest_favorites');
          const parsed = raw ? JSON.parse(raw) : [];
          setFavoriteEventIds(
            Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
          );
        } catch {
          setFavoriteEventIds([]);
        }
      }
    } catch {
      const [cachedEv, cachedNet, cachedMe, cachedConns] = await Promise.all([
        readOfflineCache<BusinessEvent[]>('events'),
        readOfflineCache<ProfessionalNetwork[]>('networks'),
        readOfflineCache<{
          user: MemberAccount;
          profile: ProfessionalProfile | null;
          enterprise: EnterprisePage | null;
          payments: PaymentRecord[];
          subscriptionLogs?: SubscriptionEventLog[];
          registrations?: EventRegistration[];
          blocks?: BlockedMemberSummary[];
          visibilityStats?: { profileViews: number; enterpriseViews: number };
          notifications: AppNotification[];
        }>('me'),
        readOfflineCache<{ connections: ContactConnection[]; peers: PeerSummary[] }>('connections'),
      ]);
      if (cachedEv) setEvents(cachedEv);
      if (cachedNet) setNetworks(cachedNet);
      if (cachedMe && token) {
        setUser(cachedMe.user);
        setProfile(cachedMe.profile);
        setEnterprise(cachedMe.enterprise);
        setPayments(cachedMe.payments || []);
        setSubscriptionLogs(cachedMe.subscriptionLogs || []);
        setRegistrations(cachedMe.registrations || []);
        setBlocks(cachedMe.blocks || []);
        setVisibilityStats(cachedMe.visibilityStats || { profileViews: 0, enterpriseViews: 0 });
        setNotifications(cachedMe.notifications || []);
        try {
          const raw = localStorage.getItem(`ae_user_favorites_${cachedMe.user.id}`);
          const parsed = raw ? JSON.parse(raw) : cachedMe.user.favoriteEventIds || [];
          setFavoriteEventIds(
            Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
          );
        } catch {
          setFavoriteEventIds(cachedMe.user.favoriteEventIds || []);
        }
      }
      if (cachedConns && token) {
        setConnections(cachedConns.connections);
        setPeers(cachedConns.peers);
      }
    }

    const q = await getOfflineQueue();
    setPendingQueueCount(q.length);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', darkMode ? '#000000' : '#F9F9F9');
    }
    try {
      localStorage.setItem('ae_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title =
      lang === 'en'
        ? 'Africa Entrepreneur — Encrypted Business Network & Events'
        : 'Africa Entrepreneur — Réseau & Événements Chiffrés';
    try {
      localStorage.setItem('ae_lang', lang);
    } catch {
      // Ignore storage errors
    }
  }, [lang]);

  useEffect(() => {
    if (isOnline && pendingQueueCount === 0 && manualSyncNotice === null) return;
    setSyncClockTick(Date.now());
    const id = window.setInterval(() => setSyncClockTick(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [isOnline, pendingQueueCount, manualSyncNotice]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!user?.calendarSyncEnabled) return;
    const items = selectEventsForCalendarSync({
      events,
      registrations,
      favoriteEventIds,
      scope: user.calendarSyncScope || 'all_saved',
    });
    const ics = buildIcsCalendar(items, {
      calendarName: `Africa Entrepreneur — ${user.fullName}`,
    });
    writeOfflineCache('calendar_ics_snapshot', {
      ics,
      count: items.length,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }, [user?.id, user?.fullName, user?.calendarSyncEnabled, user?.calendarSyncScope, events, registrations, favoriteEventIds]);

  const appendLocalReminderNotification = useCallback(
    (title: string, body: string, key: string) => {
      const notifId = `rem-${key}`;
      setLocalReminderNotifs((prev) => {
        if (prev.some((n) => n.id === notifId)) return prev;
        const item: AppNotification = {
          id: notifId,
          memberId: user?.id || 'local',
          kind: 'reminder',
          title,
          body,
          read: false,
          createdAt: new Date().toISOString(),
        };
        return [item, ...prev].slice(0, 20);
      });
    },
    [user?.id]
  );

  // Open deep-linked event from local push notification click (?eventId=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const deepEventId = params.get('eventId');
      if (deepEventId) {
        setActiveTab('catalogue');
        setCatalogueEventId(deepEventId);
        params.delete('eventId');
        const nextSearch = params.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {
      // Ignore URL parsing issues
    }
  }, []);

  // Listen to Service Worker local reminder events & notification clicks
  useEffect(() => {
    return subscribeToServiceWorkerReminders({
      onReminderSent: (data) => {
        appendLocalReminderNotification(data.title, data.body, data.reminderKey);
      },
      onOpenEvent: (eventId) => {
        setCatalogueEventId(eventId);
        setActiveTab('catalogue');
      },
    });
  }, [appendLocalReminderNotification]);

  // Synchronize favorite events with Service Worker & run resilient 30-min reminder evaluator
  useEffect(() => {
    syncFavoriteRemindersWithSW({
      enabled: favoriteReminderEnabled,
      events,
      favoriteEventIds,
      lang,
      leadMinutes: REMINDER_LEAD_MINUTES,
    }).catch(() => {});

    if (!favoriteReminderEnabled || favoriteEventIds.length === 0 || events.length === 0) {
      return;
    }

    let timeoutId: number | undefined;
    let cancelled = false;

    const evaluateDueReminders = async () => {
      if (cancelled) return;
      const cap = getNotificationCapability();
      setNotifPermission(cap.permission);

      const sentMap = readSentReminders(events);
      const schedule = buildFavoriteReminderSchedule(
        events,
        favoriteEventIds,
        sentMap,
        Date.now(),
        REMINDER_LEAD_MINUTES
      );

      for (const item of schedule.dueNow) {
        const payload = buildReminderNotificationPayload(
          item.event,
          item.minutesRemaining,
          lang,
          REMINDER_LEAD_MINUTES
        );
        if (cap.permission === 'granted') {
          await dispatchLocalNotification(payload);
        }
        markReminderSent(item.reminderKey);
        appendLocalReminderNotification(payload.title, payload.body, item.reminderKey);
      }

      if (schedule.dueNow.length > 0) {
        syncFavoriteRemindersWithSW({
          enabled: favoriteReminderEnabled,
          events,
          favoriteEventIds,
          lang,
          leadMinutes: REMINDER_LEAD_MINUTES,
        }).catch(() => {});
      }

      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (schedule.nextTriggerMs !== null) {
        const delayMs = schedule.nextTriggerMs - Date.now();
        if (delayMs > 0 && delayMs <= 24 * 60 * 60 * 1000) {
          timeoutId = window.setTimeout(() => {
            evaluateDueReminders();
          }, Math.max(500, delayMs + 250));
        }
      }
    };

    evaluateDueReminders();
    const intervalId = window.setInterval(evaluateDueReminders, 15_000);
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        evaluateDueReminders();
      }
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', evaluateDueReminders);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', evaluateDueReminders);
    };
  }, [events, favoriteEventIds, favoriteReminderEnabled, notifPermission, lang, appendLocalReminderNotification]);

  useEffect(() => {
    return () => {
      if (syncNoticeTimerRef.current !== null) {
        window.clearTimeout(syncNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    flushOfflineMutations().then(async ({ flushed, remaining }) => {
      setPendingQueueCount(remaining);
      if (flushed > 0) {
        setLastSuccessfulSyncAt(saveLastSyncTimestamp());
        setSyncClockTick(Date.now());
        await loadData();
      }
    });
  }, [isOnline, loadData]);

  const handleManualSync = useCallback(async () => {
    if (manualSyncing) return;
    setManualSyncing(true);
    try {
      const { flushed, remaining } = await flushOfflineMutations();
      setPendingQueueCount(remaining);
      let refreshed = false;
      if (flushed > 0 || remaining === 0) {
        try {
          await loadData();
          refreshed = true;
        } catch {
          refreshed = false;
        }
      }
      if (flushed > 0 || refreshed) {
        setLastSuccessfulSyncAt(saveLastSyncTimestamp());
        setSyncClockTick(Date.now());
      }
      const outcome = describeOfflineSyncOutcome({ flushed, remaining, refreshed }, lang);
      setManualSyncNotice(outcome);
      if (syncNoticeTimerRef.current !== null) {
        window.clearTimeout(syncNoticeTimerRef.current);
      }
      syncNoticeTimerRef.current = window.setTimeout(() => {
        setManualSyncNotice(null);
      }, 4000);
    } finally {
      setManualSyncing(false);
    }
  }, [manualSyncing, loadData, lang]);

  useEffect(() => {
    const token = getSavedToken();
    if (!user || !token || !isOnline) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let ws: WebSocket | null = null;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        }
      };

      ws.onerror = () => {
        // Silently ignore proxy WebSocket errors on restricted mobile networks
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type: string; payload: unknown };
          if (msg.type === 'presence:update' || msg.type === 'auth:ok') {
            const p = msg.payload as { onlineUsers?: string[] };
            if (Array.isArray(p?.onlineUsers)) setOnlineUsers(p.onlineUsers);
          } else if (msg.type === 'message:new') {
            const rec = msg.payload as EncryptedMessageRecord;
            setRealtimeMessages((prev) => [...prev, rec]);
          } else if (msg.type === 'message:read') {
            const sig = msg.payload as { peerId: string; readAt: string };
            if (sig?.peerId) setReadReceiptSignal(sig);
          } else if (msg.type === 'group:message') {
            const gmsg = msg.payload as GroupMessage;
            setRealtimeGroupMessages((prev) => [...prev, gmsg]);
          } else if (msg.type === 'notification:new') {
            const n = msg.payload as AppNotification;
            setNotifications((prev) => [n, ...prev]);
          } else if (
            msg.type === 'connection:updated' ||
            msg.type === 'event:updated' ||
            msg.type === 'subscription:updated'
          ) {
            loadData();
          }
        } catch {
          // Ignore malformed frame
        }
      };
    } catch {
      ws = null;
      wsRef.current = null;
    }

    return () => {
      if (ws) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [user?.id, isOnline, loadData]);

  const handleAuthSuccess = async (loggedUser: MemberAccount) => {
    setUser(loggedUser);
    setFavoriteEventIds(Array.isArray(loggedUser.favoriteEventIds) ? loggedUser.favoriteEventIds : []);
    setAuthModalOpen(false);
    setChatPeerId(null);
    setRealtimeMessages([]);
    setRealtimeGroupMessages([]);
    setConnections([]);
    setPeers([]);
    setNotifications([]);
    setPayments([]);
    setSubscriptionLogs([]);
    setRegistrations([]);
    setBlocks([]);
    if (loggedUser.role !== 'admin' && activeTab === 'admin') {
      setActiveTab('home');
    }
    if (loggedUser.role !== 'organizer' && loggedUser.role !== 'admin' && activeTab === 'organizer') {
      setActiveTab('home');
    }
    await loadData();
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    saveToken(null);
    setCachedPrivateKeyJwk(null);
    setUser(null);
    setActiveTab('home');
    await loadData();
  };

  const handleNavigate = (
    tab: NavTab,
    opts?: { sector?: string; eventId?: string; searchQuery?: string }
  ) => {
    if (opts?.sector !== undefined) setCatalogueSector(opts.sector);
    if (opts?.eventId !== undefined) setCatalogueEventId(opts.eventId);
    else if (tab === 'catalogue') setCatalogueEventId(undefined);
    if (opts?.searchQuery !== undefined) setCatalogueSearchQuery(opts.searchQuery);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleFavorite = async (eventId: string) => {
    const nextIds = toggleFavoriteId(favoriteEventIds, eventId);
    setFavoriteEventIds(nextIds);
    if (!user) {
      try {
        localStorage.setItem('ae_guest_favorites', JSON.stringify(nextIds));
      } catch {
        // Ignore storage quota errors
      }
      return;
    }

    try {
      localStorage.setItem(`ae_user_favorites_${user.id}`, JSON.stringify(nextIds));
    } catch {
      // Ignore storage quota errors
    }

    try {
      const { queued, data } = await queueOrSendMutation<{ favoriteEventIds?: string[] }>({
        clientMutationId: `fav-${eventId}-${Date.now()}`,
        endpoint: `/api/events/${eventId}/favorite`,
        method: 'POST',
        label: lang === 'en' ? 'Event favorite' : 'Favori événement',
      });
      if (queued) {
        const q = await getOfflineQueue();
        setPendingQueueCount(q.length);
      } else if (data?.favoriteEventIds) {
        setFavoriteEventIds(data.favoriteEventIds);
        try {
          localStorage.setItem(`ae_user_favorites_${user.id}`, JSON.stringify(data.favoriteEventIds));
        } catch {
          // Ignore
        }
      }
    } catch {
      // Keep local optimistic update if transient network failure occurs
    }
  };

  const handleSaveBadgeContact = async (badge: ScannedBadgeContact) => {
    setScannedBadges((prev) => {
      const merged = mergeScannedBadgeList(prev, badge);
      try {
        localStorage.setItem('ae_scanned_badges', JSON.stringify(merged));
      } catch {
        // Ignore storage quota
      }
      writeOfflineCache('scanned_badges', merged).catch(() => {});
      return merged;
    });
  };

  const handleToggleFavoriteReminders = async (enabled: boolean) => {
    let currentPerm = getNotificationCapability().permission;
    if (enabled && currentPerm === 'default') {
      currentPerm = await requestLocalNotificationPermission();
      setNotifPermission(currentPerm);
    }
    setFavoriteReminderEnabled(enabled);
    writeReminderPrefs({ enabled, leadMinutes: REMINDER_LEAD_MINUTES });

    if (user) {
      queueOrSendMutation({
        clientMutationId: `rem-pref-${Date.now()}`,
        endpoint: '/api/me/profile',
        method: 'PUT',
        body: { favoriteReminderEnabled: enabled },
        label: lang === 'en' ? 'Push favorite reminders' : 'Rappels Push favoris',
      }).catch(() => {});
    }
  };

  const handleRequestNotificationPermission = async () => {
    const perm = await requestLocalNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      setFavoriteReminderEnabled(true);
      writeReminderPrefs({ enabled: true, leadMinutes: REMINDER_LEAD_MINUTES });
      if (user) {
        queueOrSendMutation({
          clientMutationId: `rem-perm-${Date.now()}`,
          endpoint: '/api/me/profile',
          method: 'PUT',
          body: { favoriteReminderEnabled: true },
          label: lang === 'en' ? 'Enable Push reminders' : 'Activation rappels Push',
        }).catch(() => {});
      }
    }
  };

  const localizedEvents = useMemo(
    () => events.map((ev) => localizeEvent(ev, lang)),
    [events, lang]
  );
  const localizedNetworks = useMemo(
    () => networks.map((net) => localizeNetwork(net, lang)),
    [networks, lang]
  );

  const handleTestFavoriteReminder = async (): Promise<boolean> => {
    let perm = getNotificationCapability().permission;
    if (perm === 'default') {
      perm = await requestLocalNotificationPermission();
      setNotifPermission(perm);
    }
    const favoriteSample =
      localizedEvents.find((e) => favoriteEventIds.includes(e.id)) || localizedEvents[0];
    const { dispatched, payload } = await triggerTestFavoriteReminder(favoriteSample, lang);
    appendLocalReminderNotification(payload.title, payload.body, `test-${Date.now()}`);
    return dispatched;
  };

  const mergedNotifications = [...localReminderNotifs, ...notifications].map((n) =>
    localizeNotification(n, lang)
  );
  const unreadNotifCount = mergedNotifications.filter((n) => !n.read).length;
  const isOrganizerOrAdmin = user?.role === 'organizer' || user?.role === 'admin';

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: copy.navHome, icon: Home },
    { id: 'catalogue', label: copy.navCatalogue, icon: Compass },
    { id: 'subscription', label: copy.navOffers, icon: CreditCard },
    { id: 'directory', label: copy.navDirectory, icon: Users },
    { id: 'messages', label: copy.navMessages, icon: MessageSquare },
  ];

  const markNotificationsRead = async () => {
    setNotifOpen((o) => !o);
    setLocalReminderNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    if (notifications.some((n) => !n.read) && user) {
      try {
        await apiFetch('/api/notifications/read-all', { method: 'POST' });
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {
        // Ignore
      }
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--ae-bg)] text-[#000000] dark:text-[#F9F9F9] flex flex-col lg:flex-row">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-[var(--ae-border)] bg-white/95 dark:bg-[#08080A]/95 backdrop-blur-xl px-4 py-6 justify-between">
        <div className="space-y-7">
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            aria-label={lang === 'en' ? 'Africa Entrepreneur Home' : 'Accueil Afrika Entrepreneur'}
            className="flex w-full items-center justify-center px-1 text-left focus:outline-none"
          >
            <BrandMark size={80} />
            <span className="sr-only">Africa Entrepreneur</span>
          </button>

          <nav aria-label={lang === 'en' ? 'Main navigation' : 'Navigation principale'} className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`flex w-full min-h-[44px] items-center gap-3 rounded-full px-4 text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                    active
                      ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_10px_24px_-8px_rgba(232,80,2,0.75)]'
                      : 'text-[#333333] dark:text-[#A7A7A7] hover:bg-black/5 dark:hover:bg-white/8 hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {isOrganizerOrAdmin && (
              <button
                type="button"
                onClick={() => handleNavigate('organizer')}
                className={`flex w-full min-h-[44px] items-center gap-3 rounded-full px-4 text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                  activeTab === 'organizer'
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_10px_24px_-8px_rgba(232,80,2,0.75)]'
                    : 'text-[#333333] dark:text-[#A7A7A7] hover:bg-black/5 dark:hover:bg-white/8 hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                <CalendarCheck2 className="h-4 w-4 shrink-0" />
                <span>{copy.navOrganizer}</span>
              </button>
            )}

            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className={`flex w-full min-h-[44px] items-center gap-3 rounded-full px-4 text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                  activeTab === 'admin'
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_10px_24px_-8px_rgba(232,80,2,0.75)]'
                    : 'text-[#333333] dark:text-[#A7A7A7] hover:bg-black/5 dark:hover:bg-white/8 hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                <Shield className="h-4 w-4 shrink-0" />
                <span>{copy.navAdmin}</span>
              </button>
            )}
          </nav>
        </div>

        <div className="space-y-3 border-t border-[var(--ae-border)] pt-4">
          <PWAInstallButton lang={lang} />

          {user ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--ae-border)] bg-[#F3EFEA] dark:bg-[#141417] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] truncate">{user.fullName}</p>
                <p className="text-[11px] text-[#646464] dark:text-[#A7A7A7] truncate">
                  {translateRole(user.role, user.subscriptionStatus, lang)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                aria-label={copy.logout}
                title={copy.logout}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-[#333333] dark:text-[#A7A7A7] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#E85002]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full orange-glow-btn text-xs font-semibold transition-colors"
            >
              <LogIn className="h-4 w-4" />
              <span>{copy.connectOrRegister}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-dvh min-w-0">
        {/* Frosted Translucent Navigation Bar */}
        <header className="sticky top-0 z-30 pt-safe min-h-[4rem] lg:min-h-[3.5rem] ios-glass-header px-2.5 sm:px-6 lg:px-8 flex items-center justify-between gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            aria-label={lang === 'en' ? 'Africa Entrepreneur Home' : 'Accueil Afrika Entrepreneur'}
            className="flex items-center lg:hidden shrink-0"
          >
            <BrandMark size={40} variant="compact" />
            <span className="sr-only">Africa Entrepreneur</span>
          </button>

          <p className="hidden lg:block text-sm font-semibold text-[#000000] dark:text-[#F9F9F9]">
            {activeTab === 'home' && copy.topTitleHome}
            {activeTab === 'catalogue' && copy.topTitleCatalogue}
            {activeTab === 'subscription' && copy.topTitleSubscription}
            {activeTab === 'directory' && copy.topTitleDirectory}
            {activeTab === 'messages' && copy.topTitleMessages}
            {activeTab === 'organizer' && copy.topTitleOrganizer}
            {activeTab === 'admin' && copy.topTitleAdmin}
          </p>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Dark / Light Theme Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-pressed={darkMode}
              aria-label={darkMode ? copy.lightThemeLabel : copy.darkThemeLabel}
              title={darkMode ? copy.lightThemeLabel : copy.darkThemeLabel}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#141417] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
            >
              {darkMode ? <Sun className="h-4 w-4 text-[#F16001]" /> : <Moon className="h-4 w-4 text-[#333333]" />}
            </button>

            {/* Segmented Control FR / EN */}
            <div className="ios-segmented inline-flex">
              {(['fr', 'en'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-label={lang === 'en' ? `Language ${code.toUpperCase()}` : `Langue ${code.toUpperCase()}`}
                  className={`min-h-[28px] rounded-full px-2 sm:px-2.5 text-[11px] font-bold uppercase transition-all ${
                    lang === code
                      ? 'bg-[#E85002] text-[#F9F9F9] shadow-xs'
                      : 'text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>

            <div className="lg:hidden">
              <PWAInstallButton compact lang={lang} />
            </div>

            {(user || mergedNotifications.length > 0) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={markNotificationsRead}
                  aria-label={copy.notificationsTitle}
                  className="relative min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#141417] text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] transition-colors"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E85002] px-1 font-mono text-[10px] font-bold text-[#F9F9F9]">
                      {unreadNotifCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-[var(--ae-border)] bg-white dark:bg-[#141417] p-4 shadow-2xl z-50">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--ae-border)]">
                      <span className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">{copy.notificationsTitle}</span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        aria-label={lang === 'en' ? 'Close notifications' : 'Fermer les notifications'}
                        className="text-[#646464] dark:text-[#A7A7A7] hover:text-[#E85002]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-[var(--ae-border)]">
                      {mergedNotifications.length === 0 ? (
                        <p className="py-4 text-xs text-[#646464] dark:text-[#A7A7A7]">{copy.noNotifications}</p>
                      ) : (
                        mergedNotifications.map((n) => (
                          <div key={n.id} className="py-2.5 text-xs">
                            <p className="font-semibold text-[#000000] dark:text-[#F9F9F9]">{n.title}</p>
                            <p className="mt-0.5 text-[#333333] dark:text-[#A7A7A7]">{n.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {user ? (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="min-h-[36px] sm:min-h-[38px] rounded-full border border-[var(--ae-border)] bg-white dark:bg-[#141417] px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-[#000000] dark:text-[#F9F9F9] hover:border-[#E85002] whitespace-nowrap transition-colors"
              >
                <span className="sm:hidden">{copy.accountShort}</span>
                <span className="hidden sm:inline">{copy.switchAccount}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="min-h-[36px] sm:min-h-[38px] rounded-full orange-glow-btn px-3 sm:px-4 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors"
              >
                {copy.connect}
              </button>
            )}
          </div>
        </header>

        {(!isOnline || pendingQueueCount > 0 || manualSyncNotice !== null) && (
          <div
            role="status"
            aria-live="polite"
            className="bg-[#F3EFEA] dark:bg-[#1A1A1D] border-b border-[var(--ae-border-ice)] px-4 py-2 text-xs text-[#000000] dark:text-[#F9F9F9] flex flex-wrap items-center justify-center gap-2.5 font-medium"
          >
            <div className="flex items-center gap-2 min-w-0">
              {manualSyncNotice?.status === 'synced' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-[#E85002]" />
              )}
              <span className="truncate">
                {manualSyncNotice
                  ? manualSyncNotice.text
                  : !isOnline
                    ? pendingQueueCount > 0
                      ? `${copy.offlineBanner} (${pendingQueueCount})`
                      : copy.offlineBanner
                    : `${copy.syncingBanner} (${pendingQueueCount})`}
              </span>
            </div>

            <span
              data-testid="last-sync-elapsed"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ae-border)] bg-white/80 dark:bg-[#121214] px-2.5 py-1 text-[11px] font-medium text-[#646464] dark:text-[#D9C3AB] whitespace-nowrap"
            >
              <Clock className="h-3 w-3 shrink-0 text-[#E85002]" />
              <span>{buildLastSyncLabel(lastSuccessfulSyncAt, syncClockTick, lang)}</span>
            </span>

            {(!isOnline || pendingQueueCount > 0) && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={manualSyncing}
                aria-label={copy.manualSyncBtn}
                className="min-h-[32px] inline-flex items-center gap-1.5 rounded-full bg-[#E85002] px-3.5 py-1 text-[11px] font-semibold text-[#F9F9F9] shadow-xs hover:bg-[#F16001] active:scale-95 transition-all disabled:opacity-65 whitespace-nowrap"
              >
                <RefreshCw className={`h-3 w-3 shrink-0 ${manualSyncing ? 'animate-spin' : ''}`} />
                <span>{manualSyncing ? copy.manualSyncBusy : copy.manualSyncBtn}</span>
              </button>
            )}
          </div>
        )}

        {/* Active View Container */}
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-10">
          {activeTab === 'home' && (
            <HomeView
              user={user}
              events={localizedEvents}
              networks={localizedNetworks}
              registrations={registrations}
              connections={connections}
              scannedBadges={scannedBadges}
              favoriteEventIds={favoriteEventIds}
              onlineUsers={onlineUsers}
              lang={lang}
              darkMode={darkMode}
              favoriteReminderEnabled={favoriteReminderEnabled}
              notifPermission={notifPermission}
              onEnableFavoriteReminders={handleRequestNotificationPermission}
              onToggleFavoriteReminders={handleToggleFavoriteReminders}
              onTestFavoriteReminder={handleTestFavoriteReminder}
              onOpenBadgeScanner={() => setQuickScannerOpen(true)}
              onNavigate={handleNavigate}
              onToggleFavorite={handleToggleFavorite}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'catalogue' && (
            <CatalogueView
              user={user}
              events={localizedEvents}
              networks={localizedNetworks}
              favoriteEventIds={favoriteEventIds}
              scannedBadges={scannedBadges}
              initialSector={catalogueSector}
              initialEventId={catalogueEventId}
              initialSearchQuery={catalogueSearchQuery}
              lang={lang}
              favoriteReminderEnabled={favoriteReminderEnabled}
              notifPermission={notifPermission}
              onEnableFavoriteReminders={handleRequestNotificationPermission}
              onToggleFavoriteReminders={handleToggleFavoriteReminders}
              onTestFavoriteReminder={handleTestFavoriteReminder}
              onRefresh={loadData}
              onToggleFavorite={handleToggleFavorite}
              onSaveBadgeContact={handleSaveBadgeContact}
              onGoToSubscription={() => handleNavigate('subscription')}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'subscription' && (
            <SubscriptionView
              user={user}
              payments={payments}
              subscriptionLogs={subscriptionLogs}
              lang={lang}
              onUpdated={async (updatedUser) => {
                setUser(updatedUser);
                await loadData();
              }}
              onNavigate={(tab) => handleNavigate(tab)}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'directory' && (
            <DirectoryView
              user={user}
              profile={profile}
              enterprise={enterprise}
              connections={connections}
              blocks={blocks}
              events={localizedEvents}
              registrations={registrations}
              favoriteEventIds={favoriteEventIds}
              scannedBadges={scannedBadges}
              visibilityStats={visibilityStats}
              onlineUsers={onlineUsers}
              lang={lang}
              favoriteReminderEnabled={favoriteReminderEnabled}
              notifPermission={notifPermission}
              onToggleFavoriteReminders={handleToggleFavoriteReminders}
              onRequestNotificationPermission={handleRequestNotificationPermission}
              onTestFavoriteReminder={handleTestFavoriteReminder}
              onRefresh={loadData}
              onSaveBadgeContact={handleSaveBadgeContact}
              onGoToSubscription={() => handleNavigate('subscription')}
              onOpenChat={(peerId) => {
                setChatPeerId(peerId);
                handleNavigate('messages');
              }}
              onOpenAuth={() => setAuthModalOpen(true)}
              onAccountDeleted={handleLogout}
            />
          )}

          {activeTab === 'messages' && (
            <MessagesView
              user={user}
              connections={connections}
              peers={peers}
              onlineUsers={onlineUsers}
              lang={lang}
              initialPeerId={chatPeerId}
              incomingRealtimeMessages={realtimeMessages}
              incomingGroupMessages={realtimeGroupMessages}
              readReceiptSignal={readReceiptSignal}
              onRefresh={loadData}
              onGoToSubscription={() => handleNavigate('subscription')}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'organizer' && (
            <OrganizerView user={user} lang={lang} onRefreshApp={loadData} />
          )}

          {activeTab === 'admin' && <AdminView user={user} lang={lang} onRefreshApp={loadData} />}

          <footer className="mt-10 border-t border-[var(--ae-border)] pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-[#646464] dark:text-[#A7A7A7]">
            <p>{copy.disclaimer}</p>
            <p className="font-mono shrink-0">{copy.e2eeBadge}</p>
          </footer>
        </main>
      </div>

      {/* Floating Pill Capsule Bottom Tab Bar on Mobile & Tablet */}
      <nav
        aria-label={lang === 'en' ? 'Mobile navigation' : 'Navigation mobile'}
        className="lg:hidden fixed bottom-[max(0.625rem,env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 mx-auto max-w-md rounded-full light-dock px-2 py-1.5"
      >
        <div className="flex items-center justify-around gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-label={item.label}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                  active
                    ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_18px_-4px_rgba(232,80,2,0.75)] scale-105'
                    : 'bg-black/5 dark:bg-[#1E1E22] text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? 'stroke-[2.25]' : ''}`} />
                <span className="sr-only">{item.label}</span>
              </button>
            );
          })}
          {isOrganizerOrAdmin && (
            <button
              type="button"
              onClick={() => handleNavigate('organizer')}
              aria-label={copy.navOrganizer}
              title={copy.navOrganizer}
              aria-current={activeTab === 'organizer' ? 'page' : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                activeTab === 'organizer'
                  ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_18px_-4px_rgba(232,80,2,0.75)] scale-105'
                  : 'bg-black/5 dark:bg-[#1E1E22] text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
              }`}
            >
              <CalendarCheck2 className={`h-5 w-5 shrink-0 ${activeTab === 'organizer' ? 'stroke-[2.25]' : ''}`} />
              <span className="sr-only">{copy.navOrganizer}</span>
            </button>
          )}
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => handleNavigate('admin')}
              aria-label="Admin"
              title="Admin"
              aria-current={activeTab === 'admin' ? 'page' : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                activeTab === 'admin'
                  ? 'bg-[#E85002] text-[#F9F9F9] shadow-[0_6px_18px_-4px_rgba(232,80,2,0.75)] scale-105'
                  : 'bg-black/5 dark:bg-[#1E1E22] text-[#646464] dark:text-[#A7A7A7] hover:text-[#000000] dark:hover:text-[#F9F9F9]'
              }`}
            >
              <Shield className={`h-5 w-5 shrink-0 ${activeTab === 'admin' ? 'stroke-[2.25]' : ''}`} />
              <span className="sr-only">Admin</span>
            </button>
          )}
        </div>
      </nav>

      {/* Quick Badge OCR Scanner Modal */}
      <BadgeScannerModal
        isOpen={quickScannerOpen}
        event={localizedEvents[0] ?? null}
        mode="event_contact"
        isAuthenticated={Boolean(user)}
        lang={lang}
        onClose={() => setQuickScannerOpen(false)}
        onSaveBadgeContact={handleSaveBadgeContact}
      />

      {/* Auth Modal */}
      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md my-auto">
            <button
              type="button"
              onClick={() => setAuthModalOpen(false)}
              aria-label={lang === 'en' ? 'Close authentication dialog' : 'Fermer la fenêtre de connexion'}
              className="absolute right-3 top-3 z-10 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full bg-white/95 dark:bg-[#1A1A1D] text-[#000000] dark:text-[#F9F9F9] shadow-sm hover:border hover:border-[#E85002]"
            >
              <X className="h-4 w-4" />
            </button>
            <AuthView lang={lang} onSuccess={handleAuthSuccess} onClose={() => setAuthModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
