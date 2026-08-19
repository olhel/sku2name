import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataset } from '../src/ingest/normalize.mjs';

const SKU_GUID = 'aaaaaaaa-0000-4000-8000-000000000001';
const REAL_PLAN = '11111111-0000-4000-8000-000000000001';
// Stands in for 3227bcb2-8448-4f81-b3c2-8c2074e15a2a, the SKU GUID of
// Microsoft_Viva_Sales, which Microsoft also lists in the friendly-names
// column of the M365_Copilot row.
const STRAY_SKU_GUID = 'bbbbbbbb-0000-4000-8000-000000000002';

const observation = (planId, technicalName, friendlyName) => ({
  planId,
  technicalName,
  friendlyName,
  source: 'md',
  retiredUpstream: false,
});

const merged = (planObservations) => ({
  skus: [
    {
      skuId: SKU_GUID,
      stringIds: [{ name: 'SHARED', count: 1 }],
      productNames: [{ name: 'Shared Product', count: 1 }],
      servicePlanIds: [REAL_PLAN],
      sources: ['md'],
      edgeSources: {},
    },
  ],
  planObservations,
  incompatibilityGroups: [],
  document: {},
  issues: [],
  quirks: [],
  counts: {},
});

test('a stray GUID in the friendly-names column does not mint a service plan', () => {
  const out = normalizeDataset(
    merged([
      observation(REAL_PLAN, 'REAL_PLAN', 'Real Plan'),
      // Friendly name only, no technical name, and no SKU includes it.
      observation(STRAY_SKU_GUID, null, 'Microsoft Sales Copilot'),
    ])
  );
  const ids = out.servicePlans.map((p) => p.planId);
  assert.ok(ids.includes(REAL_PLAN));
  assert.ok(
    !ids.includes(STRAY_SKU_GUID),
    'a friendly-only observation must not bring a plan into being'
  );
});

test('a plan with no SKUs survives when it has a technical name', () => {
  // PURVIEW_DISCOVERY is real, is named in the technical column, and is
  // currently in zero SKUs. Dropping it would lose a genuine page.
  const orphanButNamed = '33333333-0000-4000-8000-000000000003';
  const out = normalizeDataset(
    merged([
      observation(REAL_PLAN, 'REAL_PLAN', 'Real Plan'),
      observation(orphanButNamed, 'PURVIEW_DISCOVERY', 'Purview Discovery'),
    ])
  );
  const plan = out.servicePlans.find((p) => p.planId === orphanButNamed);
  assert.ok(plan, 'a named plan in zero SKUs is still a plan');
  assert.equal(plan.technicalName, 'PURVIEW_DISCOVERY');
});

test('a friendly-only observation still names a plan that exists', () => {
  const out = normalizeDataset(
    merged([
      observation(REAL_PLAN, 'REAL_PLAN', null),
      observation(REAL_PLAN, null, 'Real Plan'),
    ])
  );
  const plan = out.servicePlans.find((p) => p.planId === REAL_PLAN);
  assert.equal(plan.technicalName, 'REAL_PLAN');
  assert.equal(plan.friendlyName, 'Real Plan', 'the friendly column still contributes a display name');
});

test('no service plan ever reaches the renderer without a name', () => {
  const out = normalizeDataset(
    merged([
      observation(REAL_PLAN, 'REAL_PLAN', 'Real Plan'),
      observation(STRAY_SKU_GUID, null, 'Stray'),
    ])
  );
  for (const plan of out.servicePlans) {
    assert.ok(
      plan.technicalName || plan.friendlyName,
      `plan ${plan.planId} has neither name and would render "(null)"`
    );
  }
});
