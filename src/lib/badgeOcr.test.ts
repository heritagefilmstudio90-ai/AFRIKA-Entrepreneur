import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBadgeContrastFilter,
  mergeScannedBadgeList,
  parseBadgeOcrText,
} from './badgeOcr.ts';

test('parseBadgeOcrText extracts profile fields from a French/English conference badge', () => {
  const sample = `
    AFRICA ENTREPRENEUR SUMMIT
    Kofi Boateng
    Directeur Général · Volta Pay SAS
    Fintech & Paiements B2B
    kofi.boateng@voltapay.io
    +221 77 440 12 88
    Dakar, Sénégal
    linkedin.com/in/kofi-boateng
  `;
  const parsed = parseBadgeOcrText(sample);
  assert.equal(parsed.fullName, 'Kofi Boateng');
  assert.equal(parsed.headline, 'Directeur Général');
  assert.equal(parsed.companyName, 'Volta Pay SAS');
  assert.equal(parsed.sector, 'Fintech');
  assert.equal(parsed.email, 'kofi.boateng@voltapay.io');
  assert.equal(parsed.phone, '+221 77 440 12 88');
  assert.equal(parsed.city, 'Dakar');
  assert.equal(parsed.country, 'Sénégal');
  assert.equal(parsed.linkedinUrl, 'https://linkedin.com/in/kofi-boateng');
});

test('applyBadgeContrastFilter converts RGBA pixels to high-contrast grayscale', () => {
  // Pixel 1: dark ink (40,40,40), Pixel 2: light paper (210,210,210)
  const buf = new Uint8ClampedArray([40, 40, 40, 255, 210, 210, 210, 255]);
  const out = applyBadgeContrastFilter(buf, 1.5);
  assert.equal(out[0], out[1]);
  assert.equal(out[1], out[2]);
  assert.ok(out[0] < 40, 'Dark pixel should become darker for sharper text contrast');
  assert.ok(out[4] > 210, 'Light pixel should become brighter');
  assert.equal(out[3], 255);
});

test('mergeScannedBadgeList deduplicates by email and places latest scan first', () => {
  const first = {
    id: 'b-1',
    fullName: 'Awa Koné',
    headline: 'CEO',
    companyName: 'AgroTech CI',
    sector: 'Agro-industrie',
    email: 'awa@agrotech.ci',
    phone: '+225 07 11 22 33',
    city: 'Abidjan',
    country: 'Côte d’Ivoire',
    createdAt: '2026-11-19T10:00:00.000Z',
  };
  const updated = {
    ...first,
    id: 'b-2',
    email: 'AWA@AGROTECH.CI',
    headline: 'Fondatrice & CEO',
    createdAt: '2026-11-20T10:00:00.000Z',
  };
  const merged = mergeScannedBadgeList([first], updated);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'b-2');
  assert.equal(merged[0].headline, 'Fondatrice & CEO');
});
