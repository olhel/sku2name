// The contract both parsers produce and the merge consumes.
//
// Keeping this shape explicit is what lets either source be replaced without
// touching anything downstream. Both parsers are pure: no I/O, no network,
// no clock.
//
// RawDataset {
//   source: 'csv' | 'md' | 'merged'
//   skus: RawSku[]
//   planObservations: RawPlanObservation[]
//   incompatibilityGroups: IncompatibilityGroup[]
//   document: { msDate?, lastUpdated?, lastUpdatedRaw? }
//   issues: Issue[]
//   quirks: Quirk[]
//   counts: Record<string, number>
// }
//
// RawSku {
//   skuId: string                          canonical lowercase GUID, the identity
//   productNames: NameCount[]              every observed spelling, with counts
//   stringIds: NameCount[]                 every observed String ID, with counts
//   servicePlanIds: string[]               document order, deduplicated
//   planSources: Record<string, string[]>  planId to the files carrying that edge
//   sources: string[]                      which files carried this SKU
//   provenance: Record<string, object>     per-source location
// }
//
// NameCount { name: string, count: number, sources: string[] }
//
// RawPlanObservation {
//   planId, technicalName, friendlyName, retiredUpstream, skuId, source, line
// }

import { byCodeUnit } from '../lib/sort.mjs';

/** Merge two NameCount lists, summing counts and unioning sources. */
export function mergeNameCounts(a = [], b = []) {
  const merged = new Map();
  for (const entry of [...a, ...b]) {
    if (!entry || !entry.name) continue;
    const existing = merged.get(entry.name);
    const sources = entry.sources || [];
    if (existing) {
      existing.count += entry.count || 0;
      for (const source of sources) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      }
    } else {
      merged.set(entry.name, { name: entry.name, count: entry.count || 0, sources: [...sources] });
    }
  }
  return [...merged.values()]
    .map((entry) => ({ ...entry, sources: entry.sources.sort(byCodeUnit) }))
    .sort((x, y) => byCodeUnit(x.name, y.name));
}

/** Tag a bare NameCount list with the source that produced it. */
export function tagNameCounts(names = [], source) {
  return names.map(({ name, count }) => ({ name, count, sources: [source] }));
}

/** Extract comparable sets, used by tests to assert merge commutativity. */
export function datasetSets(dataset) {
  const skus = new Set(dataset.skus.map((sku) => sku.skuId));
  const edges = new Set();
  for (const sku of dataset.skus) {
    for (const planId of sku.servicePlanIds) edges.add(`${sku.skuId}>${planId}`);
  }
  const plans = new Set(dataset.planObservations.map((observation) => observation.planId));
  return { skus, plans, edges };
}
