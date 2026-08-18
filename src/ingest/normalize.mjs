// Turn the merged RawDataset into the committed dataset.
//
// Output is fully sorted and free of timestamps so that repeated runs over
// unchanged input are byte-identical. Anything time-dependent is supplied by
// the caller rather than read from a clock here.

import { byCodeUnit } from '../lib/sort.mjs';
import { hashValue } from '../lib/hash.mjs';
import { pickCanonical, collectAliases, resolvePlanNames } from './canonical-names.mjs';
import { assignSlugs, emptyRegistry } from './slug-registry.mjs';
import { deriveCategories } from './derive-categories.mjs';

/**
 * @param {object} merged output of mergeSources
 * @param {{registry?: object, firstSeen?: string|null}} [options]
 */
export function normalizeDataset(merged, { registry = emptyRegistry(), firstSeen = null } = {}) {
  const planObservationsById = groupBy(merged.planObservations, 'planId');

  // --- service plans -------------------------------------------------------
  const planRecords = new Map();
  for (const [planId, observations] of planObservationsById) {
    const resolved = resolvePlanNames(observations);
    planRecords.set(planId, {
      planId,
      technicalName: resolved.technicalName,
      friendlyName: resolved.friendlyName,
      aliases: resolved.aliases,
      retiredUpstream: resolved.retiredUpstream,
      sources: resolved.sources,
      observations: resolved.observations,
    });
  }

  // --- SKUs ----------------------------------------------------------------
  const skuRecords = merged.skus.map((sku) => {
    const stringId = pickCanonical(sku.stringIds, { kind: 'technical' });
    const productName = pickCanonical(sku.productNames, { kind: 'product' });
    return {
      skuId: sku.skuId,
      stringId,
      productName,
      aliases: {
        stringId: collectAliases(sku.stringIds, stringId),
        productName: collectAliases(sku.productNames, productName),
      },
      servicePlanIds: sku.servicePlanIds,
      // Almost every edge is carried by both files, so storing a source array
      // per edge would add ~6,000 near-identical entries to the committed
      // data and bury a real change in noise. Only the exceptions are
      // recorded; anything not listed came from both sources.
      ...singleSourceEdges(sku.planSources),
      sources: sku.sources,
      categories: deriveCategories({ stringId, productName }),
    };
  });

  // --- slugs ---------------------------------------------------------------
  const skuSlugs = assignSlugs(
    skuRecords.map((sku) => ({
      guid: sku.skuId,
      base: sku.stringId || sku.productName,
      disambiguator: sku.productName,
    })),
    registry,
    'sku',
    { firstSeen }
  );

  const planSlugs = assignSlugs(
    [...planRecords.values()].map((plan) => ({
      guid: plan.planId,
      base: plan.technicalName || plan.friendlyName,
      disambiguator: plan.friendlyName,
    })),
    skuSlugs.registry,
    'servicePlan',
    { firstSeen }
  );

  for (const sku of skuRecords) sku.slug = skuSlugs.assignments.get(sku.skuId);
  for (const plan of planRecords.values()) plan.slug = planSlugs.assignments.get(plan.planId);

  // --- incompatibility groups ---------------------------------------------
  const incompatibilityGroups = (merged.incompatibilityGroups || []).map((group) => ({
    service: group.service,
    members: group.members.map((member) => ({
      name: member.name,
      planId: member.planId,
      // Null rather than a broken link when the conflict table references a
      // plan that is not in the main table.
      resolved: planRecords.has(member.planId),
    })),
  }));

  const skus = [...skuRecords].sort((a, b) => byCodeUnit(a.skuId, b.skuId));
  const servicePlans = [...planRecords.values()].sort((a, b) => byCodeUnit(a.planId, b.planId));

  return {
    skus,
    servicePlans,
    incompatibilityGroups,
    slugRegistry: planSlugs.registry,
    // Excludes every timestamp, so it changes only when the data changes. This
    // is the only hash that decides whether to commit and redeploy.
    datasetHash: `sha256:${hashValue({ skus, servicePlans, incompatibilityGroups })}`,
    counts: {
      skus: skus.length,
      servicePlans: servicePlans.length,
      edges: skus.reduce((total, sku) => total + sku.servicePlanIds.length, 0),
      skusFromCsvOnly: merged.counts.skusFromCsvOnly,
      skusFromMdOnly: merged.counts.skusFromMdOnly,
      edgesFromCsvOnly: merged.counts.edgesFromCsvOnly,
      edgesFromMdOnly: merged.counts.edgesFromMdOnly,
      plansWithoutFriendlyName: servicePlans.filter((plan) => !plan.friendlyName).length,
      plansWithAliases: servicePlans.filter(
        (plan) => plan.aliases.technical.length > 0 || plan.aliases.friendly.length > 0
      ).length,
      plansRetiredUpstream: servicePlans.filter((plan) => plan.retiredUpstream).length,
      disambiguationPages:
        Object.keys(planSlugs.registry.disambiguation.sku).length +
        Object.keys(planSlugs.registry.disambiguation.servicePlan).length,
      incompatibilityGroups: incompatibilityGroups.length,
      unresolvedIncompatibilityRefs: incompatibilityGroups.reduce(
        (total, group) => total + group.members.filter((member) => !member.resolved).length,
        0
      ),
    },
    slugChanges: { sku: skuSlugs, servicePlan: planSlugs },
  };
}

/** Reverse index: planId -> skuIds. Derived at build time, never committed. */
export function buildReverseIndex(skus) {
  const index = new Map();
  for (const sku of skus) {
    for (const planId of sku.servicePlanIds) {
      if (!index.has(planId)) index.set(planId, []);
      index.get(planId).push(sku.skuId);
    }
  }
  for (const skuIds of index.values()) skuIds.sort(byCodeUnit);
  return index;
}

/**
 * Reduce a per-edge source map to just the edges a single file carried.
 * Keys are omitted entirely when empty, keeping the common SKU record small.
 */
function singleSourceEdges(planSources = {}) {
  const csvOnly = [];
  const mdOnly = [];
  for (const [planId, sources] of Object.entries(planSources)) {
    if (sources.length !== 1) continue;
    if (sources[0] === 'csv') csvOnly.push(planId);
    else if (sources[0] === 'md') mdOnly.push(planId);
  }
  const out = {};
  if (csvOnly.length) out.edgesCsvOnly = csvOnly.sort(byCodeUnit);
  if (mdOnly.length) out.edgesMdOnly = mdOnly.sort(byCodeUnit);
  return out;
}

function groupBy(items, key) {
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item[key])) grouped.set(item[key], []);
    grouped.get(item[key]).push(item);
  }
  return grouped;
}
