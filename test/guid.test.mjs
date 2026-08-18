import test from 'node:test';
import assert from 'node:assert/strict';
import { isGuid, repairGuid, hyphenate, normaliseLooseGuid } from '../src/ingest/guid.mjs';

test('accepts a well-formed lowercase GUID with rule none', () => {
  const result = repairGuid('113feb6c-3fe4-4440-bddc-54d774bf0318');
  assert.equal(result.guid, '113feb6c-3fe4-4440-bddc-54d774bf0318');
  assert.equal(result.repaired, false);
  assert.equal(result.rule, 'none');
});

test('lowercases an uppercase GUID and says so', () => {
  const result = repairGuid('6FD2C87F-B296-42F0-B197-1E91E994B900');
  assert.equal(result.guid, '6fd2c87f-b296-42f0-b197-1e91e994b900');
  assert.equal(result.rule, 'lowercase');
});

// The two defects that actually exist in Microsoft's markdown today.
test('repairs the known internal-space GUID', () => {
  const result = repairGuid('882e1d05-acd1-4ccb-8708- 6ee03664b117');
  assert.equal(result.guid, '882e1d05-acd1-4ccb-8708-6ee03664b117');
  assert.equal(result.rule, 'strip-space');
  assert.equal(result.repaired, true);
});

test('repairs the known space-and-missing-hyphen GUID', () => {
  const result = repairGuid('113feb6c-3fe4-4440-bddc 54d774bf0318');
  assert.equal(result.guid, '113feb6c-3fe4-4440-bddc-54d774bf0318');
  assert.equal(result.rule, 'rehyphenate');
});

test('returns the raw value on every repair so the allowlist can match it', () => {
  const raw = '882e1d05-acd1-4ccb-8708- 6ee03664b117';
  assert.equal(repairGuid(raw).raw, raw);
});

test('rejects a 31-hex-digit string', () => {
  assert.equal(repairGuid('113feb6c-3fe4-4440-bddc-54d774bf031').guid, null);
});

test('rejects non-hex characters', () => {
  assert.equal(repairGuid('113feb6c-3fe4-4440-bddc-54d774bfzzzz').guid, null);
  assert.equal(repairGuid('not-a-guid').rule, 'invalid');
});

test('rejects null and undefined without throwing', () => {
  assert.equal(repairGuid(null).guid, null);
  assert.equal(repairGuid(undefined).guid, null);
});

test('isGuid only accepts the canonical form', () => {
  assert.ok(isGuid('113feb6c-3fe4-4440-bddc-54d774bf0318'));
  assert.ok(!isGuid('113FEB6C-3FE4-4440-BDDC-54D774BF0318'));
  assert.ok(!isGuid('113feb6c3fe44440bddc54d774bf0318'));
});

test('hyphenate inserts 8-4-4-4-12', () => {
  assert.equal(hyphenate('113feb6c3fe44440bddc54d774bf0318'), '113feb6c-3fe4-4440-bddc-54d774bf0318');
});

test('normaliseLooseGuid accepts the shapes a user might paste', () => {
  const expected = '6fd2c87f-b296-42f0-b197-1e91e994b900';
  for (const input of [
    '6fd2c87f-b296-42f0-b197-1e91e994b900',
    '6FD2C87F-B296-42F0-B197-1E91E994B900',
    '{6FD2C87F-B296-42F0-B197-1E91E994B900}',
    '(6fd2c87f-b296-42f0-b197-1e91e994b900)',
    'urn:uuid:6fd2c87f-b296-42f0-b197-1e91e994b900',
    '6fd2c87fb29642f0b1971e91e994b900',
    '  6fd2c87f-b296-42f0-b197-1e91e994b900  ',
  ]) {
    assert.equal(normaliseLooseGuid(input), expected, `failed for ${input}`);
  }
});

test('normaliseLooseGuid rejects anything that is not a GUID', () => {
  assert.equal(normaliseLooseGuid('ENTERPRISEPACK'), null);
  assert.equal(normaliseLooseGuid('<script>'), null);
  assert.equal(normaliseLooseGuid('6fd2c87f-b296-42f0-b197'), null);
});
