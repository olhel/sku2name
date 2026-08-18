import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validate } from '../src/ingest/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowlist = JSON.parse(readFileSync(join(ROOT, 'src/ingest/quirks-allowlist.json'), 'utf8'));

const guid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

/** A dataset large enough to clear the absolute floors. */
function makeDataset(overrides = {}) {
  const servicePlans = Array.from({ length: 700 }, (_, i) => ({
    planId: guid(i + 10000),
    technicalName: `PLAN_${i}`,
    friendlyName: `Plan ${i}`,
    aliases: { technical: [], friendly: [] },
    slug: `plan_${i}`,
    retiredUpstream: false,
    sources: ['csv', 'md'],
  }));

  const skus = Array.from({ length: 600 }, (_, i) => ({
    skuId: guid(i),
    stringId: `SKU_${i}`,
    productName: `Product ${i}`,
    aliases: { stringId: [], productName: [] },
    slug: `sku_${i}`,
    // 10 edges each = 6,000 edges, above the floor.
    servicePlanIds: servicePlans.slice(i % 100, (i % 100) + 10).map((p) => p.planId),
    sources: ['csv', 'md'],
    categories: [],
  }));

  const counts = {
    skus: skus.length,
    servicePlans: servicePlans.length,
    edges: skus.reduce((t, s) => t + s.servicePlanIds.length, 0),
    skusFromCsvOnly: 5,
    skusFromMdOnly: 0,
    edgesFromCsvOnly: 20,
    edgesFromMdOnly: 20,
    plansWithoutFriendlyName: 0,
    plansWithAliases: 0,
    plansRetiredUpstream: 0,
    disambiguationPages: 0,
    incompatibilityGroups: 7,
    unresolvedIncompatibilityRefs: 0,
  };

  return {
    skus,
    servicePlans,
    incompatibilityGroups: [],
    slugRegistry: { sku: {}, servicePlan: {}, disambiguation: { sku: {}, servicePlan: {} } },
    datasetHash: 'sha256:test',
    counts,
    ...overrides,
  };
}

const makeMerged = (overrides = {}) => ({
  sourcesUsed: ['csv', 'md'],
  quirks: [],
  issues: [],
  ...overrides,
});

const run = (input) => validate({ allowlist, merged: makeMerged(), ...input });
const codes = (result) => result.errors.map((e) => e.code);

test('passes on a healthy dataset', () => {
  const result = run({ dataset: makeDataset() });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('fails on an empty dataset', () => {
  const dataset = makeDataset({ skus: [], servicePlans: [] });
  const result = run({ dataset });
  assert.ok(codes(result).includes('E1'));
  assert.equal(result.ok, false);
});

test('fails on a duplicate SKU slug', () => {
  const dataset = makeDataset();
  dataset.skus[1].slug = dataset.skus[0].slug;
  assert.ok(codes(run({ dataset })).includes('E6'));
});

test('fails on a duplicate service plan slug', () => {
  const dataset = makeDataset();
  dataset.servicePlans[1].slug = dataset.servicePlans[0].slug;
  assert.ok(codes(run({ dataset })).includes('E6'));
});

test('fails on an edge referencing an unknown service plan', () => {
  const dataset = makeDataset();
  dataset.skus[0].servicePlanIds = [guid(999999)];
  assert.ok(codes(run({ dataset })).includes('E7'));
});

test('fails on an invalid GUID', () => {
  const dataset = makeDataset();
  dataset.skus[0].skuId = 'not-a-guid';
  assert.ok(codes(run({ dataset })).includes('E3'));
});

// Count bands, the guard against a truncated or partially-parsed upstream.
test('fails when the SKU count drops 20 percent', () => {
  const previous = makeDataset();
  const dataset = makeDataset();
  dataset.skus = dataset.skus.slice(0, 480);
  dataset.counts.skus = 480;
  assert.ok(codes(run({ dataset, previous })).includes('E12'));
});

test('allows a large change when explicitly overridden', () => {
  const previous = makeDataset();
  const dataset = makeDataset();
  dataset.skus = dataset.skus.slice(0, 480);
  dataset.counts.skus = 480;
  const result = validate({
    allowlist,
    merged: makeMerged(),
    dataset,
    previous,
    options: { allowLargeChange: true },
  });
  assert.ok(!codes(result).includes('E12'));
});

test('fails when the count falls below the absolute floor', () => {
  const dataset = makeDataset();
  dataset.counts.skus = 100;
  assert.ok(codes(run({ dataset, previous: makeDataset() })).includes('E11'));
});

// Cross-source agreement: the checks that only exist because two files are parsed.
test('warns on a first missing source and fails on the second consecutive one', () => {
  const dataset = makeDataset();
  const merged = makeMerged({ sourcesUsed: ['csv'] });

  const first = validate({ allowlist, merged, dataset, options: { sourcesMissingStreak: 0 } });
  assert.ok(first.warnings.some((w) => w.code === 'W2'));
  assert.ok(!codes(first).includes('E9'));

  const second = validate({ allowlist, merged, dataset, options: { sourcesMissingStreak: 1 } });
  assert.ok(codes(second).includes('E9'));
});

test('fails when one source starts carrying the dataset alone', () => {
  const dataset = makeDataset();
  // 60 of 600 SKUs from the CSV alone is 10%, far above the 3% threshold.
  dataset.counts.skusFromCsvOnly = 60;
  assert.ok(codes(run({ dataset })).includes('E10'));
});

// The new-malformation detector.
test('fails on a GUID repair that is not in the allowlist', () => {
  const merged = makeMerged({
    quirks: [{ kind: 'guid-repair', raw: 'aaaa-bbbb novel defect', rule: 'strip-space', line: 42 }],
  });
  const result = validate({ allowlist, merged, dataset: makeDataset() });
  assert.ok(codes(result).includes('E16'));
});

test('passes on the two known allowlisted GUID defects', () => {
  const merged = makeMerged({
    quirks: [
      { kind: 'guid-repair', raw: '882e1d05-acd1-4ccb-8708- 6ee03664b117', rule: 'strip-space', line: 279 },
      { kind: 'guid-repair', raw: '113feb6c-3fe4-4440-bddc 54d774bf0318', rule: 'rehyphenate', line: 504 },
    ],
  });
  const result = validate({ allowlist, merged, dataset: makeDataset() });
  assert.ok(!codes(result).includes('E16'));
});

test('fails when a known defect appears under a different repair rule', () => {
  const merged = makeMerged({
    quirks: [{ kind: 'guid-repair', raw: '882e1d05-acd1-4ccb-8708- 6ee03664b117', rule: 'rehyphenate', line: 279 }],
  });
  assert.ok(codes(validate({ allowlist, merged, dataset: makeDataset() })).includes('E16'));
});

test('warns, rather than fails, when an allowlisted quirk stops appearing', () => {
  const result = validate({ allowlist, merged: makeMerged({ quirks: [] }), dataset: makeDataset() });
  assert.ok(result.warnings.some((w) => w.code === 'W9'));
  assert.equal(result.ok, true);
});

test('fails on an unrecognised quirk kind', () => {
  const merged = makeMerged({ quirks: [{ kind: 'something-new', raw: 'x', line: 1 }] });
  assert.ok(codes(validate({ allowlist, merged, dataset: makeDataset() })).includes('E15'));
});

// The SEO tripwire.
test('fails when a registry-pinned slug would change', () => {
  const dataset = makeDataset();
  dataset.slugRegistry.sku[guid(0)] = { slug: 'changed_slug' };
  const previousRegistry = { sku: { [guid(0)]: { slug: 'original_slug' } }, servicePlan: {} };
  assert.ok(codes(run({ dataset, previousRegistry })).includes('E14'));
});

test('passes slug stability when nothing moved', () => {
  const dataset = makeDataset();
  dataset.slugRegistry.sku[guid(0)] = { slug: 'stable_slug' };
  const previousRegistry = { sku: { [guid(0)]: { slug: 'stable_slug' } }, servicePlan: {} };
  assert.ok(!codes(run({ dataset, previousRegistry })).includes('E14'));
});

test('fails when too many SKUs have no service plans', () => {
  const dataset = makeDataset();
  for (let i = 0; i < 6; i += 1) dataset.skus[i].servicePlanIds = [];
  assert.ok(codes(run({ dataset })).includes('E8'));
});

test('reports the dataset as not-ok whenever any error fires', () => {
  const dataset = makeDataset();
  dataset.skus[0].slug = '';
  const result = run({ dataset });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});
