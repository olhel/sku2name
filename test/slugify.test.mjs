import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, isCleanSlug } from '../src/lib/slugify.mjs';

test('preserves underscores so slugs match what admins paste', () => {
  assert.equal(slugify('SPE_E5'), 'spe_e5');
  assert.equal(slugify('EXCHANGE_S_ENTERPRISE'), 'exchange_s_enterprise');
  assert.equal(slugify('ENTERPRISEPACK'), 'enterprisepack');
});

// Every String ID in Microsoft's data that would otherwise break a URL.
test('makes the seven URL-hostile String IDs safe', () => {
  const cases = [
    ['Microsoft_365_Business_Basic_(no Teams)', 'microsoft_365_business_basic_no-teams'],
    ['Microsoft_365_ Business_ Premium_(no Teams)', 'microsoft_365_business_premium_no-teams'],
    ['O365_w/o Teams Bundle_M3', 'o365_w-o-teams-bundle_m3'],
    ['O365_w/o Teams Bundle_M3_(500_seats_min)_HUB', 'o365_w-o-teams-bundle_m3_500_seats_min_hub'],
    ['Power Pages authenticated users T1_CN_CN', 'power-pages-authenticated-users-t1_cn_cn'],
    ['Power Pages authenticated users T2_CN_CN', 'power-pages-authenticated-users-t2_cn_cn'],
    ['Power Pages authenticated users T3_CN_CN', 'power-pages-authenticated-users-t3_cn_cn'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(slugify(input), expected, `failed for ${input}`);
  }
});

test('every produced slug is URL-safe without percent-encoding', () => {
  const inputs = [
    'Microsoft_365_Business_Basic_(no Teams)',
    'O365_w/o Teams Bundle_M3',
    'Dynamics 365 Field Service, Enterprise Edition',
    'AI Builder Capacity add-on',
  ];
  for (const input of inputs) {
    const slug = slugify(input);
    assert.equal(encodeURIComponent(slug), slug, `not URL-safe: ${slug}`);
    assert.ok(isCleanSlug(slug), `not clean: ${slug}`);
  }
});

test('is idempotent', () => {
  for (const input of ['SPE_E5', 'O365_w/o Teams Bundle_M3', 'Microsoft_365_Business_Basic_(no Teams)']) {
    assert.equal(slugify(slugify(input)), slugify(input), `not idempotent: ${input}`);
  }
});

test('strips diacritics rather than dropping the character', () => {
  assert.equal(slugify('café Ünïcode'), 'cafe-unicode');
});

test('expands ampersand and plus into words', () => {
  assert.equal(slugify('Enterprise & Mobility'), 'enterprise-and-mobility');
  assert.equal(slugify('Defender+'), 'defender-plus');
});

test('truncates at the cap without leaving a trailing separator', () => {
  const slug = slugify('a'.repeat(40) + '_' + 'b'.repeat(40), { maxLength: 41 });
  assert.equal(slug.length, 40);
  assert.ok(!/[-_]$/.test(slug));
});

test('returns empty for input with nothing sluggable, leaving the fallback to the caller', () => {
  assert.equal(slugify('---'), '');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
});
