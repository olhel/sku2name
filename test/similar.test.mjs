import test from 'node:test';
import assert from 'node:assert/strict';
import { findSimilar, EDITION_MIN_SIMILARITY } from '../src/lib/similar.mjs';

/** Build the (skus, planSets) pair findSimilar expects. */
function fixture(spec) {
  const skus = spec.map(([stringId, productName, plans]) => ({
    skuId: stringId.toLowerCase(),
    slug: stringId.toLowerCase(),
    stringId,
    productName,
    servicePlanIds: plans,
  }));
  const planSets = new Map(skus.map((s) => [s.skuId, new Set(s.servicePlanIds)]));
  return { skus, planSets, of: (id) => skus.find((s) => s.stringId === id) };
}

const names = (result) => result.items.map((i) => i.productName);

test('merges SKUs with identical plan sets, keeping one row', () => {
  const f = fixture([
    ['BASE', 'Base', ['a', 'b', 'c']],
    ['A3_FAC', 'Thing A3 for faculty', ['a', 'b']],
    ['A3_STU', 'Thing A3 for students', ['a', 'b']],
  ]);
  const out = findSimilar(f.of('BASE'), f.skus, f.planSets);
  assert.equal(out.items.length, 1, 'the two identical SKUs are one row');
  assert.equal(out.items[0].editions, 1);
});

test("pulls out the page's own editions instead of letting them fill the table", () => {
  const f = fixture([
    ['E5', 'Contoso E5', ['a', 'b', 'c', 'd']],
    ['E5_NT', 'Contoso E5 (no Teams)', ['a', 'b', 'c']],
    ['E5_HUB', 'Contoso E5 (500 seats min)', ['a', 'b', 'd']],
    ['OTHER', 'Fabrikam Suite', ['a', 'b']],
  ]);
  const out = findSimilar(f.of('E5'), f.skus, f.planSets);
  assert.equal(out.editionsOfThis, 2);
  assert.deepEqual(names(out), ['Fabrikam Suite']);
});

test('a similarly named add-on is not treated as an edition', () => {
  // Shares the "Contoso E5" prefix but almost none of the contents, which is
  // the Microsoft 365 E5 Security case.
  const f = fixture([
    ['E5', 'Contoso E5', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']],
    ['E5_SEC', 'Contoso E5 Security', ['a']],
  ]);
  const out = findSimilar(f.of('E5'), f.skus, f.planSets);
  assert.equal(out.editionsOfThis, 0, 'an add-on must not be counted as an edition');
  assert.deepEqual(names(out), ['Contoso E5 Security'], 'it earns its own row');
});

test('the plainest name heads its family, not the best-scoring member', () => {
  // Sorted by score the EEA variant leads, and it used to stand in for the
  // product people actually know.
  const f = fixture([
    ['ME', 'Mine', ['a', 'b', 'c', 'd', 'e']],
    ['O365_EEA', 'Fabrikam E5 EEA (no Teams)', ['a', 'b', 'c', 'd']],
    ['O365', 'Fabrikam E5', ['a', 'b', 'c', 'z']],
  ]);
  const out = findSimilar(f.of('ME'), f.skus, f.planSets);
  assert.deepEqual(names(out), ['Fabrikam E5']);
  assert.equal(out.items[0].editions, 1);
});

test('siblings fold into one family even when neither is the first seen', () => {
  const f = fixture([
    ['ME', 'Mine', ['a', 'b', 'c', 'd', 'e']],
    ['F_EEA', 'Fabrikam E5 EEA (no Teams)', ['a', 'b', 'c', 'd']],
    ['F_NOAUD', 'Fabrikam E5 Without Audio', ['a', 'b', 'c', 'x']],
    ['F', 'Fabrikam E5', ['a', 'b', 'c', 'z']],
  ]);
  const out = findSimilar(f.of('ME'), f.skus, f.planSets);
  assert.deepEqual(names(out), ['Fabrikam E5'], 'all three are one family');
  assert.equal(out.items[0].editions, 2);
});

test('a name that merely starts the same is not an edition', () => {
  // "Contoso E51" must not read as an edition of "Contoso E5".
  const f = fixture([
    ['ME', 'Mine', ['a', 'b']],
    ['X', 'Contoso E5', ['a', 'b']],
    ['Y', 'Contoso E51', ['a', 'b']],
  ]);
  const out = findSimilar(f.of('ME'), f.skus, f.planSets);
  // Identical contents merge them regardless, so check the name rule directly
  // on a pair whose contents differ.
  const g = fixture([
    ['ME2', 'Mine', ['a', 'b', 'c', 'd']],
    ['X2', 'Contoso E5', ['a', 'b', 'c']],
    ['Y2', 'Contoso E51', ['a', 'b', 'd']],
  ]);
  const out2 = findSimilar(g.of('ME2'), g.skus, g.planSets);
  assert.equal(out2.items.length, 2, 'E51 is its own product');
});

test('difference figures describe direction, not just overlap', () => {
  const f = fixture([
    ['ME', 'Mine', ['a', 'b', 'c']],
    ['INSIDE', 'Wholly Inside', ['a', 'b']],
    ['OVER', 'Superset', ['a', 'b', 'c', 'd', 'e']],
  ]);
  const out = findSimilar(f.of('ME'), f.skus, f.planSets);
  const inside = out.items.find((i) => i.productName === 'Wholly Inside');
  const over = out.items.find((i) => i.productName === 'Superset');
  assert.equal(inside.adds, 0, 'a contained SKU adds nothing');
  assert.equal(inside.lacks, 1);
  assert.equal(over.lacks, 0, 'a superset lacks nothing');
  assert.equal(over.adds, 2);
});

test('respects the limit and is stable across input order', () => {
  const spec = [
    ['ME', 'Mine', ['a', 'b', 'c', 'd']],
    ['P', 'Prod P', ['a']],
    ['Q', 'Prod Q', ['a', 'b']],
    ['R', 'Prod R', ['a', 'b', 'c']],
    ['S', 'Prod S', ['b', 'c', 'd']],
    ['T', 'Prod T', ['d']],
    ['U', 'Prod U', ['c', 'd']],
  ];
  const f = fixture(spec);
  const out = findSimilar(f.of('ME'), f.skus, f.planSets, 3);
  assert.equal(out.items.length, 3);

  const g = fixture([spec[0], ...spec.slice(1).reverse()]);
  const out2 = findSimilar(g.of('ME'), g.skus, g.planSets, 3);
  assert.deepEqual(names(out2), names(out), 'ranking must not depend on input order');
});

test('a SKU with no plans yields nothing rather than throwing', () => {
  const f = fixture([['ME', 'Mine', []], ['X', 'Other', ['a']]]);
  assert.deepEqual(findSimilar(f.of('ME'), f.skus, f.planSets), { items: [], editionsOfThis: 0 });
});

test('the edition threshold sits in the gap the data actually shows', () => {
  // Real editions of Microsoft 365 E5 measure 0.92 to 0.97 against it;
  // similarly named add-ons measure 0.09 to 0.27.
  assert.ok(EDITION_MIN_SIMILARITY > 0.27 && EDITION_MIN_SIMILARITY < 0.92);
});
