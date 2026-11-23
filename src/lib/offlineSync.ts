import type { OfflineMutation } from '../types/domain';

const DB_NAME = 'africa_entrepreneur_vault_v1';
const DB_VERSION = 1;
const STORE_CACHE = 'encrypted_cache';
const STORE_QUEUE = 'sync_queue';

export function deduplicateOfflineQueue(queue: OfflineMutation[]): OfflineMutation[] {
  const seen = new Set<string>();
  const out: OfflineMutation[] = [];
  for (const item of queue) {
    if (!seen.has(item.clientMutationId)) {
      seen.add(item.clientMutationId);
      out.push(item);
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function mergeByIdIdempotent<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

export interface OfflineSyncOutcome {
  flushed: number;
  remaining: number;
  refreshed: boolean;
}

export const LAST_SYNC_STORAGE_KEY = 'ae_last_sync_at';

export function saveLastSyncTimestamp(isoString: string = new Date().toISOString()): string {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, isoString);
    }
  } catch {
    // Ignore storage quota errors
  }
  return isoString;
}

export function readLastSyncTimestamp(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) return null;
    return Number.isNaN(Date.parse(raw)) ? null : raw;
  } catch {
    return null;
  }
}

export function formatElapsedSinceSync(
  lastSyncIso: string | null | undefined,
  nowMs: number = Date.now(),
  lang: 'fr' | 'en' = 'fr'
): string {
  if (!lastSyncIso) {
    return lang === 'en' ? 'no recent sync' : 'aucune synchronisation récente';
  }
  const syncMs = Date.parse(lastSyncIso);
  if (Number.isNaN(syncMs)) {
    return lang === 'en' ? 'no recent sync' : 'aucune synchronisation récente';
  }
  const diffSec = Math.max(0, Math.floor((nowMs - syncMs) / 1000));
  if (diffSec < 60) {
    return lang === 'en' ? 'just now' : 'à l’instant';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return lang === 'en' ? `${diffMin} min ago` : `il y a ${diffMin} min`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return lang === 'en' ? `${diffHours} h ago` : `il y a ${diffHours} h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return lang === 'en' ? `${diffDays} d ago` : `il y a ${diffDays} j`;
}

export function buildLastSyncLabel(
  lastSyncIso: string | null | undefined,
  nowMs: number = Date.now(),
  lang: 'fr' | 'en' = 'fr'
): string {
  const elapsed = formatElapsedSinceSync(lastSyncIso, nowMs, lang);
  return lang === 'en' ? `Last sync: ${elapsed}` : `Dernière synchro : ${elapsed}`;
}

export function describeOfflineSyncOutcome(
  outcome: OfflineSyncOutcome,
  lang: 'fr' | 'en' = 'fr'
): { status: 'synced' | 'partial' | 'offline' | 'up_to_date'; text: string } {
  if (outcome.flushed > 0 && outcome.remaining === 0) {
    return {
      status: 'synced',
      text:
        lang === 'en'
          ? `${outcome.flushed} action(s) synced`
          : `${outcome.flushed} action(s) synchronisée(s)`,
    };
  }
  if (outcome.flushed > 0 && outcome.remaining > 0) {
    return {
      status: 'partial',
      text:
        lang === 'en'
          ? `${outcome.flushed} synced · ${outcome.remaining} remaining`
          : `${outcome.flushed} synchronisée(s) · ${outcome.remaining} restante(s)`,
    };
  }
  if (outcome.remaining > 0) {
    return {
      status: 'offline',
      text:
        lang === 'en'
          ? `Network unavailable · ${outcome.remaining} queued`
          : `Réseau indisponible · ${outcome.remaining} en attente`,
    };
  }
  return {
    status: 'up_to_date',
    text: outcome.refreshed
      ? lang === 'en'
        ? 'Connection restored · Cache refreshed'
        : 'Connexion vérifiée · Cache actualisé'
      : lang === 'en'
        ? 'Offline cache ready · 0 pending'
        : 'Cache local vérifié · 0 en attente',
  };
}


function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function writeOfflineCache<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      tx.objectStore(STORE_CACHE).put({ key, value, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem(`ae_cache_${key}`, JSON.stringify(value));
    } catch {
      // Ignore storage quota errors
    }
  }
}

export async function readOfflineCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openVaultDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => resolve((req.result?.value as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`ae_cache_${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}

export async function enqueueOfflineMutation(mutation: OfflineMutation): Promise<OfflineMutation[]> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).put(mutation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return getOfflineQueue();
  } catch {
    const current = getLocalFallbackQueue();
    const next = deduplicateOfflineQueue([...current, mutation]);
    localStorage.setItem('ae_sync_queue', JSON.stringify(next));
    return next;
  }
}

export async function getOfflineQueue(): Promise<OfflineMutation[]> {
  try {
    const db = await openVaultDb();
    return await new Promise<OfflineMutation[]>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(deduplicateOfflineQueue((req.result as OfflineMutation[]) || []));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getLocalFallbackQueue();
  }
}

export async function removeOfflineMutation(id: string): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const current = getLocalFallbackQueue().filter((m) => m.id !== id);
    localStorage.setItem('ae_sync_queue', JSON.stringify(current));
  }
}

function getLocalFallbackQueue(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem('ae_sync_queue');
    return raw ? deduplicateOfflineQueue(JSON.parse(raw) as OfflineMutation[]) : [];
  } catch {
    return [];
  }
}
