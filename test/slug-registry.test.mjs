import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignSlugs,
  emptyRegistry,
  assertNoSlugChurn,
  SlugChurnError,
} from '../src/ingest/slug-registry.mjs';

const MCOPSTN5_A = '54a152dc-90de-4996-93d2-bc47e670fc06';
const MCOPSTN5_B = 'd43177b5-475b-4880-92d4-d54c27b5efbd';
const E3 = '6fd2c87f-b296-42f0-b197-1e91e994b900';

const entity = (guid, base, disambiguator) => ({ guid, base, disambiguator });

test('mints a stable slug on first assignment', () => {
  const { assignments } = assignSlugs([entity(E3, 'ENTERPRISEPACK')], emptyRegistry(), 'sku');
  assert.equal(assignments.get(E3), 'enterprisepack');
});

// The core guarantee: names churn upstream, URLs must not.
test('keeps the existing slug when the product is renamed upstream', () => {
  const first = assignSlugs([entity(E3, 'POWER_VIRTUAL_AGENTS')], emptyRegistry(), 'sku');
  const second = assignSlugs([entity(E3, 'COPILOT_STUDIO')], first.registry, 'sku');
  assert.equal(second.assignments.get(E3), 'power_virtual_agents');
  assert.equal(second.minted.length, 0, 'a rename must not mint a new slug');
});

test('MCOPSTN5 contested at first mint suffixes both and creates a disambiguation entry', () => {
  const { assignments, registry } = assignSlugs(
    [
      entity(MCOPSTN5_A, 'MCOPSTN5', 'Skype for Business PSTN Domestic Calling 120 Minutes'),
      entity(MCOPSTN5_B, 'MCOPSTN5', 'Skype for Business PSTN Calling Domestic Small'),
    ],
    emptyRegistry(),
    'sku'
  );

  const slugA = assignments.get(MCOPSTN5_A);
  const slugB = assignments.get(MCOPSTN5_B);

  assert.notEqual(slugA, slugB);
  assert.notEqual(slugA, 'mcopstn5', 'neither contender may take the bare slug');
  assert.notEqual(slugB, 'mcopstn5');
  assert.ok(slugA.startsWith('mcopstn5-'));
  assert.deepEqual(registry.disambiguation.sku.mcopstn5, [MCOPSTN5_A, MCOPSTN5_B].sort());
});

test('a later-arriving GUID never displaces an incumbent', () => {
  const first = assignSlugs([entity(E3, 'SHARED_ID')], emptyRegistry(), 'sku');
  const second = assignSlugs(
    [entity(E3, 'SHARED_ID'), entity(MCOPSTN5_A, 'SHARED_ID', 'Newcomer Product')],
    first.registry,
    'sku'
  );
  assert.equal(second.assignments.get(E3), 'shared_id', 'incumbent keeps the bare slug');
  assert.notEqual(second.assignments.get(MCOPSTN5_A), 'shared_id');
});

test('falls back to a GUID suffix when there is no usable disambiguator', () => {
  const { assignments } = assignSlugs(
    [entity(MCOPSTN5_A, 'SAME'), entity(MCOPSTN5_B, 'SAME')],
    emptyRegistry(),
    'sku'
  );
  assert.ok(assignments.get(MCOPSTN5_A).includes(MCOPSTN5_A.slice(0, 8)));
});

test('falls back to a GUID-derived slug when the base is unusable', () => {
  const { assignments } = assignSlugs([entity(E3, '---')], emptyRegistry(), 'sku');
  assert.equal(assignments.get(E3), `sku-${E3.slice(0, 8)}`);
});

test('assignment is independent of input ordering', () => {
  const entities = [
    entity(E3, 'ENTERPRISEPACK'),
    entity(MCOPSTN5_A, 'MCOPSTN5', 'A Product'),
    entity(MCOPSTN5_B, 'MCOPSTN5', 'B Product'),
  ];
  const forward = assignSlugs(entities, emptyRegistry(), 'sku').assignments;
  const backward = assignSlugs([...entities].reverse(), emptyRegistry(), 'sku').assignments;
  assert.deepEqual([...forward].sort(), [...backward].sort());
});

test('retires a GUID that disappears upstream instead of forgetting it', () => {
  const first = assignSlugs([entity(E3, 'ENTERPRISEPACK')], emptyRegistry(), 'sku', { firstSeen: '2026-08-18' });
  const second = assignSlugs([], first.registry, 'sku', { firstSeen: '2026-09-01' });

  assert.equal(second.registry.sku[E3].retired, true);
  assert.equal(second.registry.sku[E3].retiredOn, '2026-09-01');
  assert.equal(second.retired.length, 1);
});

test('never reuses a retired slug for a different GUID', () => {
  const first = assignSlugs([entity(E3, 'ENTERPRISEPACK')], emptyRegistry(), 'sku');
  const retiredRegistry = assignSlugs([], first.registry, 'sku').registry;
  const third = assignSlugs([entity(MCOPSTN5_A, 'ENTERPRISEPACK', 'Different Product')], retiredRegistry, 'sku');

  assert.notEqual(third.assignments.get(MCOPSTN5_A), 'enterprisepack');
  assert.equal(retiredRegistry.sku[E3].slug, 'enterprisepack', 'the retired slug stays reserved');
});

test('un-retires a GUID that reappears upstream, keeping its original slug', () => {
  const first = assignSlugs([entity(E3, 'ENTERPRISEPACK')], emptyRegistry(), 'sku');
  const gone = assignSlugs([], first.registry, 'sku').registry;
  const back = assignSlugs([entity(E3, 'ENTERPRISEPACK')], gone, 'sku');

  assert.equal(back.assignments.get(E3), 'enterprisepack');
  assert.equal(back.registry.sku[E3].retired, false);
});

test('service plan slugs are namespaced separately from SKU slugs', () => {
  const skus = assignSlugs([entity(E3, 'SHARED_NAME')], emptyRegistry(), 'sku');
  const plans = assignSlugs([entity(MCOPSTN5_A, 'SHARED_NAME')], skus.registry, 'servicePlan');
  assert.equal(plans.assignments.get(MCOPSTN5_A), 'shared_name', 'a SKU slug must not block a plan slug');
});

test('does not mutate the registry it was given', () => {
  const original = emptyRegistry();
  assignSlugs([entity(E3, 'ENTERPRISEPACK')], original, 'sku');
  assert.deepEqual(original.sku, {}, 'input registry must be untouched');
});

test('assertNoSlugChurn passes when slugs are unchanged', () => {
  const first = assignSlugs([entity(E3, 'ENTERPRISEPACK')], emptyRegistry(), 'sku');
  const second = assignSlugs([entity(E3, 'RENAMED')], first.registry, 'sku');
  assert.ok(assertNoSlugChurn(first.registry, second.registry, 'sku'));
});

test('assertNoSlugChurn throws when a pinned slug would change', () => {
  const before = { sku: { [E3]: { slug: 'enterprisepack' } } };
  const after = { sku: { [E3]: { slug: 'something_else' } } };
  assert.throws(() => assertNoSlugChurn(before, after, 'sku'), SlugChurnError);
});

// Regression: a short length cap truncated four genuinely distinct Power Pages
// String IDs (GCC / USGOV_GCCHIGH / USGOV_DOD / plain) onto the same prefix,
// manufacturing a collision and replacing four clean URLs with GUID suffixes.
test('does not manufacture collisions by truncating long distinct String IDs', () => {
  const base = 'Power_Pages_authenticated_users_T1_100_users/per_site/month_capacity_pack';
  const entities = [
    entity('11111111-0000-4000-8000-000000000001', base),
    entity('22222222-0000-4000-8000-000000000002', `${base}_GCC`),
    entity('33333333-0000-4000-8000-000000000003', `${base}_USGOV_GCCHIGH`),
    entity('44444444-0000-4000-8000-000000000004', `${base}_USGOV_DOD`),
  ];

  const { assignments, registry } = assignSlugs(entities, emptyRegistry(), 'sku');
  const slugs = [...assignments.values()];

  assert.equal(new Set(slugs).size, 4, 'all four must get distinct slugs');
  assert.equal(slugs.filter((slug) => /-[0-9a-f]{8}$/.test(slug)).length, 0, 'none should need a GUID suffix');
  assert.deepEqual(registry.disambiguation.sku, {}, 'no disambiguation page should be needed');
});

test('uses readable disambiguators only when they separate every contender', () => {
  const readable = assignSlugs(
    [
      entity(MCOPSTN5_A, 'MCOPSTN5', 'Domestic Calling 120 Minutes'),
      entity(MCOPSTN5_B, 'MCOPSTN5', 'Calling Domestic Small'),
    ],
    emptyRegistry(),
    'sku'
  );
  assert.ok([...readable.assignments.values()].every((slug) => !/-[0-9a-f]{8}$/.test(slug)));

  // Two entities sharing both names differ only by GUID, so the whole group
  // falls back together rather than ending up with an inconsistent mix.
  const identical = assignSlugs(
    [
      entity(MCOPSTN5_A, 'PROJECT_ESSENTIALS', 'Project Online Essentials'),
      entity(MCOPSTN5_B, 'PROJECT_ESSENTIALS', 'Project Online Essentials'),
    ],
    emptyRegistry(),
    'servicePlan'
  );
  const slugs = [...identical.assignments.values()];
  assert.equal(new Set(slugs).size, 2);
  assert.ok(slugs.every((slug) => /-[0-9a-f]{8}$/.test(slug)), 'both must use a GUID suffix');
});
