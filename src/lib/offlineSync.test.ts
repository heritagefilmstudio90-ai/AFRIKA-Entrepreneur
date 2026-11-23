import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLastSyncLabel,
  deduplicateOfflineQueue,
  describeOfflineSyncOutcome,
  formatElapsedSinceSync,
  mergeByIdIdempotent,
} from './offlineSync';
import type { OfflineMutation } from '../types/domain';

test('Offline sync queue deduplicates by clientMutationId and preserves chronological order', () => {
  const mutations: OfflineMutation[] = [
    { id: '1', clientMutationId: 'mut-b', endpoint: '/api/messages', method: 'POST', createdAt: '2026-11-19T10:05:00Z', label: 'Message 2' },
    { id: '2', clientMutationId: 'mut-a', endpoint: '/api/messages', method: 'POST', createdAt: '2026-11-19T10:01:00Z', label: 'Message 1' },
    { id: '3', clientMutationId: 'mut-b', endpoint: '/api/messages', method: 'POST', createdAt: '2026-11-19T10:05:00Z', label: 'Message 2 dup' },
  ];

  const deduped = deduplicateOfflineQueue(mutations);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].clientMutationId, 'mut-a');
  assert.equal(deduped[1].clientMutationId, 'mut-b');
});

test('mergeByIdIdempotent prevents duplicate items on reconnection sync', () => {
  const local = [
    { id: 'm1', title: 'Local' },
    { id: 'm2', title: 'Keep' },
  ];
  const incoming = [
    { id: 'm1', title: 'Server Updated' },
    { id: 'm3', title: 'New' },
  ];
  const merged = mergeByIdIdempotent(local, incoming);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((x) => x.id === 'm1')?.title, 'Server Updated');
});

test('describeOfflineSyncOutcome formats synced, offline, and refreshed states in FR/EN', () => {
  assert.deepEqual(
    describeOfflineSyncOutcome({ flushed: 2, remaining: 0, refreshed: true }, 'fr'),
    { status: 'synced', text: '2 action(s) synchronisée(s)' }
  );
  assert.deepEqual(
    describeOfflineSyncOutcome({ flushed: 0, remaining: 3, refreshed: false }, 'fr'),
    { status: 'offline', text: 'Réseau indisponible · 3 en attente' }
  );
  assert.deepEqual(
    describeOfflineSyncOutcome({ flushed: 0, remaining: 0, refreshed: true }, 'en'),
    { status: 'up_to_date', text: 'Connection restored · Cache refreshed' }
  );
});

test('formatElapsedSinceSync and buildLastSyncLabel format relative time in FR and EN', () => {
  const base = Date.parse('2026-11-22T12:00:00.000Z');
  assert.equal(formatElapsedSinceSync(null, base, 'fr'), 'aucune synchronisation récente');
  assert.equal(formatElapsedSinceSync('invalid-date', base, 'en'), 'no recent sync');
  assert.equal(formatElapsedSinceSync('2026-11-22T11:59:35.000Z', base, 'fr'), 'à l’instant');
  assert.equal(formatElapsedSinceSync('2026-11-22T11:59:35.000Z', base, 'en'), 'just now');
  assert.equal(formatElapsedSinceSync('2026-11-22T11:48:00.000Z', base, 'fr'), 'il y a 12 min');
  assert.equal(formatElapsedSinceSync('2026-11-22T11:48:00.000Z', base, 'en'), '12 min ago');
  assert.equal(formatElapsedSinceSync('2026-11-22T09:00:00.000Z', base, 'fr'), 'il y a 3 h');
  assert.equal(formatElapsedSinceSync('2026-11-20T12:00:00.000Z', base, 'en'), '2 d ago');
  assert.equal(buildLastSyncLabel('2026-11-22T11:55:00.000Z', base, 'fr'), 'Dernière synchro : il y a 5 min');
  assert.equal(buildLastSyncLabel('2026-11-22T11:55:00.000Z', base, 'en'), 'Last sync: 5 min ago');
});

