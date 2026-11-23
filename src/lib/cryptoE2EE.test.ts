import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptPayloadE2EE,
  deriveKeyFingerprint,
  deriveSharedSecretKey,
  encryptPayloadE2EE,
  generateIdentityKeyPair,
  unwrapPrivateKeyWithPassphrase,
  wrapPrivateKeyWithPassphrase,
} from './cryptoE2EE';

test('E2EE ECDH P-256 + AES-GCM-256 encrypts and decrypts between two peers, rejects third party', async () => {
  const alice = await generateIdentityKeyPair();
  const bob = await generateIdentityKeyPair();
  const eve = await generateIdentityKeyPair();

  const fpAlice = await deriveKeyFingerprint(alice.publicKeyJwk);
  assert.equal(fpAlice, alice.fingerprint);
  assert.equal(fpAlice.includes('·'), true);

  const aliceSharedWithBob = await deriveSharedSecretKey(alice.privateKeyJwk, bob.publicKeyJwk);
  const bobSharedWithAlice = await deriveSharedSecretKey(bob.privateKeyJwk, alice.publicKeyJwk);
  const eveSharedWithAlice = await deriveSharedSecretKey(eve.privateKeyJwk, alice.publicKeyJwk);

  const secretPayload = { text: 'Investissement série A Dakar — confidentiel', amount: 250000 };
  const envelope = await encryptPayloadE2EE(secretPayload, aliceSharedWithBob);

  assert.equal(envelope.alg, 'AES-GCM-256');
  assert.equal(envelope.ciphertext.includes('Dakar'), false);

  const decryptedByBob = await decryptPayloadE2EE<typeof secretPayload>(envelope, bobSharedWithAlice);
  assert.deepEqual(decryptedByBob, secretPayload);

  const decryptedByEve = await decryptPayloadE2EE<typeof secretPayload>(envelope, eveSharedWithAlice);
  assert.equal(decryptedByEve, null);
});

test('E2EE private key wrapping with PBKDF2 passphrase succeeds with right secret and rejects wrong secret', async () => {
  const alice = await generateIdentityKeyPair();
  const wrapped = await wrapPrivateKeyWithPassphrase(alice.privateKeyJwk, 'MonCoffreSecret!2026', 10000);

  const unwrappedOk = await unwrapPrivateKeyWithPassphrase(wrapped, 'MonCoffreSecret!2026');
  assert.deepEqual(unwrappedOk, alice.privateKeyJwk);

  const unwrappedBad = await unwrapPrivateKeyWithPassphrase(wrapped, 'MauvaisMotDePasse');
  assert.equal(unwrappedBad, null);
});
