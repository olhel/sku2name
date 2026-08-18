import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSources } from '../src/ingest/merge-sources.mjs';
import { datasetSets, mergeNameCounts } from '../src/ingest/raw-dataset.mjs';

const GUID_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const GUID_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const PLAN_1 = '11111111-0000-4000-8000-000000000001';
const PLAN_2 = '22222222-0000-4000-8000-000000000002';
const PLAN_3 = '33333333-0000-4000-8000-000000000003';

function sku(skuId, stringId, productName, planIds, line = 1) {
  return {
    skuId,
    stringIds: [{ name: stringId, count: 1 }],
    productNames: [{ name: productName, count: 1 }],
    servicePlanIds: planIds,
    line,
  };
}

function dataset(source, skus, planObservations = []) {
  return { source, skus, planObservations, incompatibilityGroups: [], document: {}, issues: [], quirks: [] };
}

const csvSide = () =>
  dataset('csv', [sku(GUID_A, 'SHARED', 'Shared Product', [PLAN_1, PLAN_2]), sku(GUID_B, 'CSVONLY', 'CSV Only', [PLAN_1])]);

// GUID_A gains PLAN_3, which only the markdown knows about. This mirrors the
// real Windows 10 ESU case.
const mdSide = () => dataset('md', [sku(GUID_A, 'SHARED', 'Shared Product', [PLAN_1, PLAN_3])]);

test('unions SKUs from both sources', () => {
  const merged = mergeSources({ csv: csvSide(), markdown: mdSide() });
  assert.equal(merged.counts.skus, 2);
  assert.deepEqual(merged.skus.map((s) => s.skuId).sort(), [GUID_A, GUID_B]);
});

test('markdown-only edges survive the merge', () => {
  const merged = mergeSources({ csv: csvSide(), markdown: mdSide() });
  const shared = merged.skus.find((s) => s.skuId === GUID_A);
  assert.ok(shared.servicePlanIds.includes(PLAN_3), 'the markdown-only edge must not be dropped');
  assert.deepEqual(shared.planSources[PLAN_3], ['md']);
});

test('records both sources on an edge that appears in both files', () => {
  const merged = mergeSources({ csv: csvSide(), markdown: mdSide() });
  const shared = merged.skus.find((s) => s.skuId === GUID_A);
  assert.deepEqual(shared.planSources[PLAN_1], ['csv', 'md']);
  assert.deepEqual(shared.planSources[PLAN_2], ['csv']);
  assert.deepEqual(shared.sources, ['csv', 'md']);
});

test('preserves the primary document order and appends secondary-only edges', () => {
  const merged = mergeSources({ csv: csvSide(), markdown: mdSide() });
  const shared = merged.skus.find((s) => s.skuId === GUID_A);
  assert.deepEqual(shared.servicePlanIds, [PLAN_1, PLAN_2, PLAN_3]);
});

test('counts per-source contributions for the validation gate', () => {
  const merged = mergeSources({ csv: csvSide(), markdown: mdSide() });
  assert.equal(merged.counts.skusFromCsvOnly, 1);
  assert.equal(merged.counts.skusFromMdOnly, 0);
  assert.equal(merged.counts.edgesFromMdOnly, 1);
});

// The two tests the plan calls out as carrying outsized weight.
test('merge is commutative over entity and edge sets', () => {
  const forward = datasetSets(mergeSources({ csv: csvSide(), markdown: mdSide() }));
  const reverse = datasetSets(mergeSources({ csv: mdSide(), markdown: csvSide() }));
  assert.deepEqual([...forward.skus].sort(), [...reverse.skus].sort());
  assert.deepEqual([...forward.edges].sort(), [...reverse.edges].sort());
});

test('merging a source with itself is a no-op', () => {
  const single = mergeSources({ csv: csvSide() });
  const doubled = mergeSources({ csv: csvSide(), markdown: csvSide() });
  assert.deepEqual(datasetSets(single).skus, datasetSets(doubled).skus);
  assert.deepEqual(datasetSets(single).edges, datasetSets(doubled).edges);
  assert.equal(doubled.counts.edges, single.counts.edges, 'edges must not be double counted');
});

test('works with only one source present', () => {
  assert.equal(mergeSources({ csv: csvSide() }).counts.skus, 2);
  assert.equal(mergeSources({ markdown: mdSide() }).counts.skus, 1);
  assert.deepEqual(mergeSources({ csv: csvSide() }).sourcesUsed, ['csv']);
});

test('throws when given no source at all', () => {
  assert.throws(() => mergeSources({}), /at least one source/);
});

test('keeps competing product names from both files as alias candidates', () => {
  const a = dataset('csv', [sku(GUID_A, 'SHARED', 'Copilot Studio', [PLAN_1])]);
  const b = dataset('md', [sku(GUID_A, 'SHARED', 'Power Virtual Agents', [PLAN_1])]);
  const merged = mergeSources({ csv: a, markdown: b });
  const names = merged.skus[0].productNames;
  assert.deepEqual(names.map((n) => n.name), ['Copilot Studio', 'Power Virtual Agents']);
  assert.deepEqual(names.find((n) => n.name === 'Power Virtual Agents').sources, ['md']);
});

test('output ordering is deterministic regardless of input ordering', () => {
  const forward = mergeSources({ csv: csvSide(), markdown: mdSide() });
  const shuffled = dataset('csv', [...csvSide().skus].reverse());
  const backward = mergeSources({ csv: shuffled, markdown: mdSide() });
  assert.deepEqual(
    forward.skus.map((s) => s.skuId),
    backward.skus.map((s) => s.skuId)
  );
});

test('only the markdown contributes incompatibility groups', () => {
  const md = { ...mdSide(), incompatibilityGroups: [{ service: 'Exchange Online', members: [] }] };
  const merged = mergeSources({ csv: csvSide(), markdown: md });
  assert.equal(merged.incompatibilityGroups.length, 1);
});

test('mergeNameCounts sums counts and unions sources', () => {
  const merged = mergeNameCounts(
    [{ name: 'A', count: 2, sources: ['csv'] }],
    [{ name: 'A', count: 3, sources: ['md'] }, { name: 'B', count: 1, sources: ['md'] }]
  );
  assert.deepEqual(merged, [
    { name: 'A', count: 5, sources: ['csv', 'md'] },
    { name: 'B', count: 1, sources: ['md'] },
  ]);
});
