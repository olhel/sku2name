// Pair the technical and friendly service-plan columns.
//
// The two columns are NOT positionally aligned. In the August 2026 snapshot,
// 40 entries have a different GUID at index i in each column, and 2 rows have
// columns of different lengths. Pairing by index alone would attach the wrong
// display name to those plans.
//
// The technical column is authoritative for identity: the SKU's plan set and
// every edge come from it. The friendly column only contributes a display
// name, and since the CSV is the naming authority for almost every plan, a
// failure to pair here is a shrug rather than a correctness problem.

/**
 * @param {object[]} technical parsed entries from the technical column
 * @param {object[]} friendly parsed entries from the friendly column
 * @param {object} [context]
 * @returns {{plans: object[], issues: object[]}}
 */
export function pairPlanColumns(technical, friendly, context = {}) {
  const issues = [];
  const plans = [];

  // guid -> queue of indexes, so a GUID repeated within one row pairs twice
  // rather than both occurrences consuming the same friendly entry.
  const byGuid = new Map();
  friendly.forEach((entry, index) => {
    if (!entry.guid) return;
    if (!byGuid.has(entry.guid)) byGuid.set(entry.guid, []);
    byGuid.get(entry.guid).push(index);
  });

  const consumed = new Array(friendly.length).fill(false);
  const pending = [];

  // Pass 1: exact GUID match. Handles the order-mismatched entries.
  for (const entry of technical) {
    const queue = entry.guid ? byGuid.get(entry.guid) : null;
    if (queue && queue.length > 0) {
      const index = queue.shift();
      consumed[index] = true;
      plans.push({
        guid: entry.guid,
        technicalName: entry.name || null,
        friendlyName: friendly[index].name || null,
        pairing: 'guid',
      });
    } else {
      pending.push(entry);
    }
  }

  // Pass 2: positional fallback, but only for entries GUID matching could not
  // place. It therefore cannot mispair the known order mismatches.
  for (const entry of pending) {
    const index = entry.index;
    if (typeof index === 'number' && index < friendly.length && !consumed[index]) {
      consumed[index] = true;
      issues.push({
        kind: 'index-pairing',
        ...context,
        index,
        technicalGuid: entry.guid,
        friendlyGuid: friendly[index].guid,
      });
      plans.push({
        guid: entry.guid,
        technicalName: entry.name || null,
        friendlyName: friendly[index].name || null,
        pairing: 'index',
      });
    } else {
      issues.push({ kind: 'technical-only', ...context, index, guid: entry.guid });
      plans.push({
        guid: entry.guid,
        technicalName: entry.name || null,
        friendlyName: null,
        pairing: 'technical-only',
      });
    }
  }

  // Pass 3: leftovers in the friendly column. Recorded rather than dropped so
  // the name still reaches a plan that exists elsewhere, which is how
  // PURVIEW_DISCOVERY gets its friendly name. These are marked friendly-only
  // and parse-markdown deliberately does not turn them into edges: the
  // friendly-names column is a display column, and a GUID appearing only
  // there is a Microsoft typo rather than a membership fact. Trusting it
  // invented a service plan out of the Microsoft_Viva_Sales SKU GUID.
  friendly.forEach((entry, index) => {
    if (consumed[index]) return;
    issues.push({ kind: 'orphan-friendly', ...context, index, guid: entry.guid, name: entry.name });
    if (entry.guid) {
      plans.push({
        guid: entry.guid,
        technicalName: null,
        friendlyName: entry.name || null,
        pairing: 'friendly-only',
      });
    }
  });

  return { plans, issues };
}
