import test from 'node:test';
import assert from 'node:assert/strict';
import { pairPlanColumns } from '../src/ingest/pair-columns.mjs';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

const entry = (guid, name, index) => ({ guid, name, index });

test('pairs by GUID when the friendly column is in a different order', () => {
  const technical = [entry(A, 'ALPHA', 0), entry(B, 'BETA', 1), entry(C, 'GAMMA', 2)];
  const friendly = [entry(C, 'Gamma Friendly', 0), entry(A, 'Alpha Friendly', 1), entry(B, 'Beta Friendly', 2)];

  const { plans, issues } = pairPlanColumns(technical, friendly);

  assert.deepEqual(
    plans.map((p) => [p.technicalName, p.friendlyName]),
    [['ALPHA', 'Alpha Friendly'], ['BETA', 'Beta Friendly'], ['GAMMA', 'Gamma Friendly']]
  );
  assert.ok(plans.every((p) => p.pairing === 'guid'));
  // Order mismatch is fully resolved by GUID matching, so no fallback fires.
  assert.equal(issues.length, 0);
});

test('output order follows the technical column, not the friendly one', () => {
  const technical = [entry(A, 'ALPHA', 0), entry(B, 'BETA', 1)];
  const friendly = [entry(B, 'Beta Friendly', 0), entry(A, 'Alpha Friendly', 1)];
  const { plans } = pairPlanColumns(technical, friendly);
  assert.deepEqual(plans.map((p) => p.guid), [A, B]);
});

test('never consumes the same friendly entry twice when a GUID repeats in a row', () => {
  const technical = [entry(A, 'ALPHA', 0), entry(A, 'ALPHA', 1)];
  const friendly = [entry(A, 'First', 0), entry(A, 'Second', 1)];
  const { plans } = pairPlanColumns(technical, friendly);
  assert.deepEqual(plans.map((p) => p.friendlyName), ['First', 'Second']);
});

test('falls back to index pairing only when GUID matching cannot place an entry', () => {
  const technical = [entry(A, 'ALPHA', 0)];
  const friendly = [entry(B, 'Mismatched Friendly', 0)];
  const { plans, issues } = pairPlanColumns(technical, friendly, { line: 9 });

  assert.equal(plans[0].pairing, 'index');
  assert.equal(plans[0].friendlyName, 'Mismatched Friendly');
  assert.equal(issues[0].kind, 'index-pairing');
  assert.equal(issues[0].line, 9);
});

test('handles a friendly column longer than the technical column', () => {
  const technical = [entry(A, 'ONLY_ONE', 0)];
  const friendly = [entry(A, 'Only One', 0), entry(B, 'Orphan Friendly', 1)];
  const { plans, issues } = pairPlanColumns(technical, friendly);

  const orphan = plans.find((p) => p.guid === B);
  assert.equal(orphan.pairing, 'friendly-only');
  assert.equal(orphan.friendlyName, 'Orphan Friendly');
  assert.equal(issues.filter((i) => i.kind === 'orphan-friendly').length, 1);
});

test('handles a technical column longer than the friendly column', () => {
  const technical = [entry(A, 'FIRST', 0), entry(B, 'SECOND', 1)];
  const friendly = [entry(A, 'First Plan', 0)];
  const { plans, issues } = pairPlanColumns(technical, friendly);

  const second = plans.find((p) => p.guid === B);
  assert.equal(second.pairing, 'technical-only');
  assert.equal(second.friendlyName, null, 'must not invent a friendly name');
  assert.equal(issues.filter((i) => i.kind === 'technical-only').length, 1);
});

test('an orphan friendly entry still yields a plan so the page is not lost', () => {
  const { plans } = pairPlanColumns([], [entry(A, 'Only Friendly', 0)]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].guid, A);
});

test('produces no plans and no issues for two empty columns', () => {
  const { plans, issues } = pairPlanColumns([], []);
  assert.deepEqual(plans, []);
  assert.deepEqual(issues, []);
});
