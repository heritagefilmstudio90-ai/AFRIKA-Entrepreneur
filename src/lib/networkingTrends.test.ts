import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNetworkingTrends30Days } from './networkingTrends.ts';

test('buildNetworkingTrends30Days returns 30 ordered days and reflects new connections & badge scans', () => {
  const fixedNow = new Date('2026-11-20T12:00:00.000Z');

  const base = buildNetworkingTrends30Days({
    connections: [
      {
        id: 'c-1',
        senderId: 'u-amina',
        recipientId: 'u-kwame',
        introMessage: 'Bonjour',
        status: 'accepted',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
      },
    ],
    messages: [],
    groupMessages: [],
    registrations: [],
    scannedBadges: [],
    userId: 'u-amina',
    now: fixedNow,
    days: 30,
  });

  assert.equal(base.days, 30);
  assert.equal(base.series.length, 30);
  assert.equal(base.series[0].dateKey, '2026-10-22');
  assert.equal(base.series[29].dateKey, '2026-11-20');

  const withActivity = buildNetworkingTrends30Days({
    connections: [
      {
        id: 'c-1',
        senderId: 'u-amina',
        recipientId: 'u-kwame',
        introMessage: 'Bonjour',
        status: 'accepted',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
      },
      {
        id: 'c-2',
        senderId: 'u-amina',
        recipientId: 'u-fatou',
        introMessage: 'Échange',
        status: 'accepted',
        createdAt: '2026-11-20T08:00:00.000Z',
        updatedAt: '2026-11-20T09:00:00.000Z',
      },
    ],
    messages: [
      {
        id: 'm-1',
        conversationId: 'u-amina__u-fatou',
        senderId: 'u-amina',
        recipientId: 'u-fatou',
        senderPubKey: { kty: 'EC' },
        envelope: { ciphertext: 'x', iv: 'y', alg: 'AES-GCM-256', v: 1 },
        mediaType: 'text',
        clientMutationId: 'mut-1',
        createdAt: '2026-11-20T09:30:00.000Z',
      },
    ],
    groupMessages: [],
    registrations: [],
    scannedBadges: [
      {
        id: 'b-1',
        ownerId: 'u-amina',
        fullName: 'Kofi Boateng',
        headline: 'CEO',
        companyName: 'Volta Pay',
        sector: 'Fintech',
        email: 'kofi@voltapay.io',
        phone: '',
        city: 'Dakar',
        country: 'Sénégal',
        createdAt: '2026-11-20T11:00:00.000Z',
      },
    ],
    userId: 'u-amina',
    now: fixedNow,
    days: 30,
  });

  const lastBase = base.series[29];
  const lastActive = withActivity.series[29];
  assert.ok(lastActive.connections > lastBase.connections);
  assert.ok(lastActive.interactions > lastBase.interactions);
  assert.ok(withActivity.summary.totalInteractions30d > base.summary.totalInteractions30d);
});
