import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPlanEntries, parsePlanEntry, parsePlanCell, repairName } from '../src/ingest/plan-cell.mjs';

test('splits on every <br/> spelling', () => {
  const cell = 'A (aaaaaaaa-0000-4000-8000-000000000001)<br/>B (bbbbbbbb-0000-4000-8000-000000000002)<br>C (cccccccc-0000-4000-8000-000000000003)<br />D (dddddddd-0000-4000-8000-000000000004)';
  assert.equal(splitPlanEntries(cell).length, 4);
});

test('splitting happens before cleaning, so entries are never fused', () => {
  // A naive clean-then-split would collapse the whitespace around the <br/>
  // and merge these two entries into one.
  const cell = 'A (aaaaaaaa-0000-4000-8000-000000000001) <br/> B (bbbbbbbb-0000-4000-8000-000000000002)';
  const entries = splitPlanEntries(cell);
  assert.equal(entries.length, 2);
  assert.equal(entries[0], 'A (aaaaaaaa-0000-4000-8000-000000000001)');
});

test('returns an empty array for an empty cell', () => {
  assert.deepEqual(splitPlanEntries(''), []);
  assert.deepEqual(parsePlanCell(''), []);
});

test('takes the GUID from the last parenthesized group', () => {
  const entry = parsePlanEntry('EXCHANGE_S_ENTERPRISE (efb87545-963c-4e0d-99df-69c6916d9eb0)');
  assert.equal(entry.name, 'EXCHANGE_S_ENTERPRISE');
  assert.equal(entry.guid, 'efb87545-963c-4e0d-99df-69c6916d9eb0');
});

test('keeps parentheses that belong to the name', () => {
  const entry = parsePlanEntry('Microsoft Application Protection and Governance (A) (5f3b1ded-75c0-4b31-8e6e-9b077eaadfd5)');
  assert.equal(entry.name, 'Microsoft Application Protection and Governance (A)');
  assert.equal(entry.guid, '5f3b1ded-75c0-4b31-8e6e-9b077eaadfd5');
});

test('repairs the unbalanced trailing paren in RMS_S_ENTERPRISE)', () => {
  const entry = parsePlanEntry('RMS_S_ENTERPRISE) (bea4c11e-220a-4e6d-8eb8-8ea15d019f90)');
  assert.equal(entry.name, 'RMS_S_ENTERPRISE');
  assert.equal(entry.nameRepaired, true);
});

test('repairName leaves balanced parens alone', () => {
  assert.deepEqual(repairName('Exchange Online (Plan 2)'), { name: 'Exchange Online (Plan 2)', nameRepaired: false });
  assert.deepEqual(repairName('Broken)'), { name: 'Broken', nameRepaired: true });
});

// Right-to-left scanning is what makes these two real defects recoverable.
test('recovers a GUID whose closing paren is missing', () => {
  const entry = parsePlanEntry('Whiteboard (Plan 2) (94a54592-cd8b-425e-87c6-97868b000b91');
  assert.equal(entry.guid, '94a54592-cd8b-425e-87c6-97868b000b91');
  assert.equal(entry.name, 'Whiteboard (Plan 2)');
  assert.equal(entry.unclosedParen, true);
});

test('keeps scanning leftward when the last group is not a GUID', () => {
  const entry = parsePlanEntry(
    'Privacy Management - Subject Rights Request (1 - Exchange) (93d24177-c2c3-408a-821d-3d25dfa66e7a) (PRIVACY_MANGEMENT_DSR_EXCHANGE_1)'
  );
  assert.equal(entry.guid, '93d24177-c2c3-408a-821d-3d25dfa66e7a');
  assert.equal(entry.name, 'Privacy Management - Subject Rights Request (1 - Exchange)');
  assert.equal(entry.guidNotLast, '(PRIVACY_MANGEMENT_DSR_EXCHANGE_1)');
});

test('repairs both known malformed GUIDs inside an entry', () => {
  assert.equal(
    parsePlanEntry('INTUNE_O365 (882e1d05-acd1-4ccb-8708- 6ee03664b117)').guid,
    '882e1d05-acd1-4ccb-8708-6ee03664b117'
  );
  assert.equal(
    parsePlanEntry('EXCHANGE_S_FOUNDATION (113feb6c-3fe4-4440-bddc 54d774bf0318)').guid,
    '113feb6c-3fe4-4440-bddc-54d774bf0318'
  );
});

test('flags an entry with no GUID rather than throwing', () => {
  const entry = parsePlanEntry('Power BI Premium EM1');
  assert.equal(entry.guid, null);
  assert.equal(entry.error, 'no-guid-parens');
  assert.equal(entry.name, 'Power BI Premium EM1');
});

test('never fabricates a GUID from a non-GUID parenthetical', () => {
  const entry = parsePlanEntry('Some Plan (not a guid)');
  assert.equal(entry.guid, null);
});

test('parsePlanCell carries the entry index for the pairing fallback', () => {
  const cell = 'A (aaaaaaaa-0000-4000-8000-000000000001)<br/>B (bbbbbbbb-0000-4000-8000-000000000002)';
  assert.deepEqual(parsePlanCell(cell, { line: 7 }).map((e) => [e.line, e.index]), [[7, 0], [7, 1]]);
});
