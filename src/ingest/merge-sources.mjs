// Merge the CSV and markdown datasets into one.
//
// Microsoft publishes the same mapping in two places and NEITHER is a superset
// of the other. As of the August 2026 snapshot the CSV carries 7 SKUs the
// markdown lacks, and the markdown carries 4 service plans the CSV lacks,
// including both Windows 10 ESU SKUs. Dropping either source loses real,
// searchable records, so the union is the dataset.
//
// Identity is the GUID, in both directions. Names are advisory: the CSV wins
// on precedence because its columns are purpose-built, and every losing
// spelling survives as an alias.

import { byCodeUnit } from '../lib/sort.mjs';
import { mergeNameCounts, tagNameCounts } from './raw-dataset.mjs';

const EMPTY = {
  source: 'none',
  skus: [],
  planObservations: [],
  incompatibilityGroups: [],
  document: {},
  issues: [],
  quirks: [],
  counts: {},
};

function alreadyTagged(names) {
  return Array.isArray(names) && names.length > 0 && Array.isArray(names[0].sources);
}

function normaliseInput(dataset, source) {
  if (!dataset) return { ...EMPTY, source };
  return {
    ...EMPTY,
    ...dataset,
    source: dataset.source || source,
    skus: (dataset.skus || []).map((sku) => ({
      ...sku,
      productNames: alreadyTagged(sku.productNames)
        ? sku.productNames
        : tagNameCounts(sku.productNames || [], source),
      stringIds: alreadyTagged(sku.stringIds) ? sku.stringIds : tagNameCounts(sku.stringIds || [], source),
    })),
  };
}

function countEdgesBySource(skus, source) {
  let total = 0;
  for (const sku of skus) {
    for (const sources of Object.values(sku.planSources)) {
      if (sources.length === 1 && sources[0] === source) total += 1;
    }
  }
  return total;
}

/**
 * @param {{csv?: object, markdown?: object}} sources
 * @returns {object} merged RawDataset
 */
export function mergeSources({ csv, markdown } = {}) {
  const available = [];
  if (csv) available.push('csv');
  if (markdown) available.push('md');
  if (available.length === 0) throw new Error('mergeSources requires at least one source');

  const primary = normaliseInput(csv, 'csv');
  const secondary = normaliseInput(markdown, 'md');

  const skus = new Map();

  // Primary first, then secondary, each in ascending GUID order. Iteration
  // order is pinned rather than inherited from Map insertion, so a rebuild of
  // unchanged input is byte-identical.
  const ordered = [
    ...[...primary.skus].sort((a, b) => byCodeUnit(a.skuId, b.skuId)).map((sku) => ({ sku, source: 'csv' })),
    ...[...secondary.skus].sort((a, b) => byCodeUnit(a.skuId, b.skuId)).map((sku) => ({ sku, source: 'md' })),
  ];

  for (const { sku, source } of ordered) {
    const existing = skus.get(sku.skuId);
    if (!existing) {
      skus.set(sku.skuId, {
        skuId: sku.skuId,
        productNames: sku.productNames,
        stringIds: sku.stringIds,
        servicePlanIds: [...sku.servicePlanIds],
        planSources: Object.fromEntries(sku.servicePlanIds.map((planId) => [planId, [source]])),
        sources: [source],
        provenance: { [source]: { line: sku.line === undefined ? null : sku.line } },
      });
      continue;
    }

    existing.productNames = mergeNameCounts(existing.productNames, sku.productNames);
    existing.stringIds = mergeNameCounts(existing.stringIds, sku.stringIds);
    if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.provenance[source] = { line: sku.line === undefined ? null : sku.line };

    // Edges present in both sources record both. Edges unique to the secondary
    // are appended after the primary's document order rather than interleaved.
    for (const planId of sku.servicePlanIds) {
      if (existing.planSources[planId]) {
        if (!existing.planSources[planId].includes(source)) existing.planSources[planId].push(source);
      } else {
        existing.servicePlanIds.push(planId);
        existing.planSources[planId] = [source];
      }
    }
  }

  const skuList = [...skus.values()].sort((a, b) => byCodeUnit(a.skuId, b.skuId));
  for (const sku of skuList) {
    sku.sources.sort(byCodeUnit);
    for (const planId of Object.keys(sku.planSources)) sku.planSources[planId].sort(byCodeUnit);
  }

  const planObservations = [...primary.planObservations, ...secondary.planObservations];
  const planIds = new Set(planObservations.map((observation) => observation.planId));
  const edgeCount = skuList.reduce((total, sku) => total + sku.servicePlanIds.length, 0);

  return {
    source: 'merged',
    sourcesUsed: available,
    skus: skuList,
    planObservations,
    // Only the markdown carries the "cannot be assigned at the same time" tables.
    incompatibilityGroups: secondary.incompatibilityGroups,
    document: { ...secondary.document, ...primary.document },
    issues: [...primary.issues, ...secondary.issues],
    quirks: [...primary.quirks, ...secondary.quirks],
    counts: {
      skus: skuList.length,
      servicePlans: planIds.size,
      edges: edgeCount,
      skusFromCsvOnly: skuList.filter((sku) => sku.sources.length === 1 && sku.sources[0] === 'csv').length,
      skusFromMdOnly: skuList.filter((sku) => sku.sources.length === 1 && sku.sources[0] === 'md').length,
      edgesFromCsvOnly: countEdgesBySource(skuList, 'csv'),
      edgesFromMdOnly: countEdgesBySource(skuList, 'md'),
    },
  };
}
