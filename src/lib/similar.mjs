// Which other SKUs are worth showing on a SKU page, and how to describe them.
//
// Ranking is Jaccard over service plan sets, which is right: it punishes both
// what a candidate lacks and what it drags in. The problem was never the score,
// it was that every near-identical edition of the same product scored highly
// and filled the whole table. On the Microsoft 365 E5 page all five rows were
// Microsoft 365 E5 wearing different hats, and Office 365 E5 appeared nowhere.
//
// So candidates are collapsed before the table is cut to five. Three rules, in
// descending order of how much they can be trusted:
//
//   1. Identical plan sets merge. Exact, and it can never merge two SKUs whose
//      contents differ. This is what folds "A3 for faculty" into
//      "A3 for students".
//   2. Editions of the same product merge, judged on name AND contents.
//      Name alone is not enough: "Microsoft 365 E5 Security" shares the prefix
//      but is an add-on, not an edition. Measured against Microsoft 365 E5,
//      real editions sit at 0.92 to 0.97 and add-ons at 0.09 to 0.27, so a
//      floor in that empty band separates them.
//   3. Editions of the page's own SKU are pulled out entirely and reported as
//      a count, rather than competing for rows.
//
// Names propose, contents dispose. A name-only rule was tried first and was
// wrong in both directions: it merged _GOV editions that genuinely differ, and
// missed _STUDENTS_USE_BENEFIT which is identical.

import { byCodeUnit } from './sort.mjs';

/** Below this, two similarly named SKUs are different products, not editions. */
export const EDITION_MIN_SIMILARITY = 0.5;

function overlap(a, b) {
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const id of small) if (large.has(id)) shared += 1;
  return { shared, score: shared / (a.size + b.size - shared) };
}

/**
 * Whether `child` names an extension of `parent`, at a word boundary so that
 * "Microsoft 365 E51" would not read as an edition of "Microsoft 365 E5".
 */
function extendsName(child, parent) {
  if (!child || !parent || child === parent || !child.startsWith(parent)) return false;
  const next = child[parent.length];
  return next === ' ' || next === '(' || next === ',' || next === '_';
}

const isEditionOf = (candidate, base, candidateSet, baseSet) =>
  extendsName(candidate, base) && overlap(candidateSet, baseSet).score >= EDITION_MIN_SIMILARITY;

/**
 * @returns {{items: object[], editionsOfThis: number}} items are ranked and
 *   capped; editionsOfThis counts this SKU's own editions, which are excluded
 *   from items because they would otherwise take every row.
 */
export function findSimilar(sku, skus, planSets, limit = 5) {
  const own = planSets.get(sku.skuId);
  if (!own || own.size === 0) return { items: [], editionsOfThis: 0 };

  const scored = [];
  for (const other of skus) {
    if (other.skuId === sku.skuId) continue;
    const theirs = planSets.get(other.skuId);
    if (!theirs || theirs.size === 0) continue;
    const { shared, score } = overlap(own, theirs);
    if (shared === 0) continue;
    scored.push({
      slug: other.slug,
      productName: other.productName,
      stringId: other.stringId,
      set: theirs,
      contents: [...theirs].sort(byCodeUnit).join('|'),
      shared,
      total: own.size,
      adds: theirs.size - shared,
      lacks: own.size - shared,
      score,
      editions: 0,
    });
  }
  scored.sort(
    (a, b) => b.score - a.score || b.shared - a.shared || byCodeUnit(a.productName, b.productName)
  );

  // 1 and 3: exact twins merge, this SKU's own editions step aside.
  const candidates = [];
  const byContents = new Map();
  let editionsOfThis = 0;
  for (const entry of scored) {
    const twin = byContents.get(entry.contents);
    if (twin) {
      twin.editions += 1;
      continue;
    }
    byContents.set(entry.contents, entry);
    if (isEditionOf(entry.productName, sku.productName, entry.set, own)) {
      editionsOfThis += 1;
      continue;
    }
    candidates.push(entry);
  }

  // 2: resolve each candidate to its family root BEFORE grouping. Grouping
  // against whichever member arrived first stranded siblings: with "Office 365
  // E5 EEA (no Teams)" holding the slot, "Office 365 E5 Without Audio
  // Conferencing" matched nothing and took a row of its own.
  const rootOf = (entry) => {
    let best = entry;
    for (const other of candidates) {
      if (other === entry) continue;
      if (!isEditionOf(entry.productName, other.productName, entry.set, other.set)) continue;
      if (other.productName.length < best.productName.length) best = other;
    }
    return best;
  };

  const items = [];
  for (const entry of candidates) {
    const root = rootOf(entry);
    if (root === entry) items.push(entry);
    else root.editions += 1 + entry.editions;
  }

  items.sort((a, b) => b.score - a.score || byCodeUnit(a.productName, b.productName));
  return {
    items: items.slice(0, limit).map(({ set, contents, score, ...rest }) => rest),
    editionsOfThis,
  };
}
