import type { MemberAccount, OfflineMutation } from '../types/domain';
import {
  deriveSharedSecretKey,
  generateIdentityKeyPair,
  unwrapPrivateKeyWithPassphrase,
  wrapPrivateKeyWithPassphrase,
} from './cryptoE2EE';
import {
  enqueueOfflineMutation,
  getOfflineQueue,
  removeOfflineMutation,
} from './offlineSync';

const TOKEN_STORAGE_KEY = 'ae_session_token';
const PRIVATE_KEY_CACHE = 'ae_e2ee_priv_jwk';

export function getSavedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getCachedPrivateKeyJwk(): JsonWebKey | null {
  try {
    const raw = localStorage.getItem(PRIVATE_KEY_CACHE);
    return raw ? (JSON.parse(raw) as JsonWebKey) : null;
  } catch {
    return null;
  }
}

export function setCachedPrivateKeyJwk(jwk: JsonWebKey | null): void {
  try {
    if (jwk) localStorage.setItem(PRIVATE_KEY_CACHE, JSON.stringify(jwk));
    else localStorage.removeItem(PRIVATE_KEY_CACHE);
  } catch {
    // Ignore
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getSavedToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur serveur (${res.status})`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data as T;
}

/**
 * Ensures the signed-in user has their local ECDH private key unlocked in memory/localStorage
 * using their vault passphrase (or registers a fresh keypair if none exists).
 */
export async function ensureUserE2EEUnlocked(
  user: MemberAccount,
  passphrase: string
): Promise<JsonWebKey | null> {
  if (user.wrappedPrivateKey) {
    const unwrapped = await unwrapPrivateKeyWithPassphrase(user.wrappedPrivateKey, passphrase);
    if (unwrapped) {
      setCachedPrivateKeyJwk(unwrapped);
      return unwrapped;
    }
  }
  // If user has no keys yet, generate and upload public + wrapped private key
  if (!user.publicKeyJwk || !user.wrappedPrivateKey) {
    const kp = await generateIdentityKeyPair();
    const wrapped = await wrapPrivateKeyWithPassphrase(kp.privateKeyJwk, passphrase, 10000);
    await apiFetch('/api/me/keys', {
      method: 'PUT',
      body: JSON.stringify({
        publicKeyJwk: kp.publicKeyJwk,
        wrappedPrivateKey: wrapped,
        keyFingerprint: kp.fingerprint,
      }),
    });
    setCachedPrivateKeyJwk(kp.privateKeyJwk);
    return kp.privateKeyJwk;
  }
  return getCachedPrivateKeyJwk();
}

export async function derivePeerAesKey(peerPublicKeyJwk?: JsonWebKey): Promise<CryptoKey | null> {
  const myPriv = getCachedPrivateKeyJwk();
  if (!myPriv || !peerPublicKeyJwk) return null;
  return deriveSharedSecretKey(myPriv, peerPublicKeyJwk);
}

export async function queueOrSendMutation<T = unknown>(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt'>
): Promise<{ queued: boolean; data?: T }> {
  if (!navigator.onLine) {
    await enqueueOfflineMutation({
      ...mutation,
      id: mutation.clientMutationId,
      createdAt: new Date().toISOString(),
    });
    return { queued: true };
  }
  try {
    const data = await apiFetch<T>(mutation.endpoint, {
      method: mutation.method,
      body: mutation.body ? JSON.stringify(mutation.body) : undefined,
    });
    return { queued: false, data };
  } catch (err) {
    // Queue only if network failure, not validation/403 errors
    if (err instanceof TypeError || !navigator.onLine) {
      await enqueueOfflineMutation({
        ...mutation,
        id: mutation.clientMutationId,
        createdAt: new Date().toISOString(),
      });
      return { queued: true };
    }
    throw err;
  }
}

export async function flushOfflineMutations(): Promise<{ flushed: number; remaining: number }> {
  const queue = await getOfflineQueue();
  let flushed = 0;
  for (const item of queue) {
    try {
      await apiFetch(item.endpoint, {
        method: item.method,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      await removeOfflineMutation(item.id);
      flushed += 1;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status && status >= 400 && status < 500) {
        // Drop invalid/rejected mutation so queue doesn't block forever
        await removeOfflineMutation(item.id);
      } else {
        break;
      }
    }
  }
  const rest = await getOfflineQueue();
  return { flushed, remaining: rest.length };
}
