// The validation gate.
//
// Errors mean: exit non-zero, write nothing, leave the previous dataset
// serving. Warnings are reported and counted but never block.
//
// The gate exists because the upstream is hand-maintained by one person at
// Microsoft, and the realistic failure is not a crash but a plausible-looking
// dataset that is quietly wrong. Refusing to publish is always better than
// publishing garbage over 1,400 pages.

import { isGuid } from './guid.mjs';
import { assertNoSlugChurn, SlugChurnError } from './slug-registry.mjs';

const DEFAULT_BANDS = {
  skus: { min: 550, tolerance: 0.05 },
  servicePlans: { min: 650, tolerance: 0.05 },
  edges: { min: 5000, tolerance: 0.1 },
};

/**
 * @param {object} input
 * @param {object} input.dataset normalized dataset
 * @param {object} input.merged merged RawDataset (for quirks and per-source counts)
 * @param {object} [input.previous] previous normalized dataset, if any
 * @param {object} input.allowlist quirks-allowlist.json
 * @param {object} [input.previousRegistry]
 * @param {{allowLargeChange?: boolean, sourcesMissingStreak?: number}} [input.options]
 * @returns {{errors: object[], warnings: object[], ok: boolean}}
 */
export function validate({
  dataset,
  merged,
  previous = null,
  allowlist,
  previousRegistry = null,
  options = {},
} = {}) {
  const errors = [];
  const warnings = [];
  const thresholds = { ...allowlist.thresholds };

  const fail = (code, message, details) => errors.push({ code, message, ...details });
  const warn = (code, message, details) => warnings.push({ code, message, ...details });

  // --- structural ---------------------------------------------------------
  if (!dataset.skus.length) fail('E1', 'Dataset contains no SKUs');
  if (!dataset.servicePlans.length) fail('E2', 'Dataset contains no service plans');

  for (const sku of dataset.skus) {
    if (!isGuid(sku.skuId)) fail('E3', `SKU has an invalid GUID: ${sku.skuId}`, { skuId: sku.skuId });
    if (!sku.stringId && !sku.productName) {
      fail('E3', `SKU ${sku.skuId} has neither a String ID nor a product name`, { skuId: sku.skuId });
    }
    if (!sku.slug) fail('E3', `SKU ${sku.skuId} has no slug`, { skuId: sku.skuId });
  }
  for (const plan of dataset.servicePlans) {
    if (!isGuid(plan.planId)) fail('E4', `Service plan has an invalid GUID: ${plan.planId}`, { planId: plan.planId });
    if (!plan.technicalName && !plan.friendlyName) {
      fail('E4', `Service plan ${plan.planId} has no name at all`, { planId: plan.planId });
    }
    if (!plan.slug) fail('E4', `Service plan ${plan.planId} has no slug`, { planId: plan.planId });
  }

  // --- uniqueness ---------------------------------------------------------
  reportDuplicates(dataset.skus.map((s) => s.skuId), (value, count) =>
    fail('E5', `Duplicate SKU GUID appears ${count} times: ${value}`, { skuId: value })
  );
  reportDuplicates(dataset.skus.map((s) => s.slug), (value, count) =>
    fail('E6', `Duplicate SKU slug appears ${count} times: ${value}`, { slug: value })
  );
  reportDuplicates(dataset.servicePlans.map((p) => p.planId), (value, count) =>
    fail('E5', `Duplicate service plan GUID appears ${count} times: ${value}`, { planId: value })
  );
  reportDuplicates(dataset.servicePlans.map((p) => p.slug), (value, count) =>
    fail('E6', `Duplicate service plan slug appears ${count} times: ${value}`, { slug: value })
  );

  // --- referential integrity ----------------------------------------------
  const planIds = new Set(dataset.servicePlans.map((plan) => plan.planId));
  let danglingEdges = 0;
  for (const sku of dataset.skus) {
    for (const planId of sku.servicePlanIds) {
      if (!planIds.has(planId)) {
        danglingEdges += 1;
        if (danglingEdges <= 5) {
          fail('E7', `SKU ${sku.stringId || sku.skuId} references unknown service plan ${planId}`, {
            skuId: sku.skuId,
            planId,
          });
        }
      }
    }
  }
  if (danglingEdges > 5) {
    fail('E7', `${danglingEdges} edges reference unknown service plans (first 5 listed)`, { danglingEdges });
  }

  const emptySkus = dataset.skus.filter((sku) => sku.servicePlanIds.length === 0);
  if (emptySkus.length > 5) {
    fail('E8', `${emptySkus.length} SKUs contain no service plans (max 5)`, {
      examples: emptySkus.slice(0, 5).map((sku) => sku.stringId || sku.skuId),
    });
  } else if (emptySkus.length > 0) {
    warn('W1', `${emptySkus.length} SKU(s) contain no service plans`, {
      examples: emptySkus.map((sku) => sku.stringId || sku.skuId),
    });
  }

  // --- cross-source agreement ---------------------------------------------
  // This is the check that only exists because there are two sources, and it
  // is the main reason to carry both.
  const sourcesUsed = merged.sourcesUsed || [];
  if (sourcesUsed.length < 2) {
    const missing = ['csv', 'md'].filter((source) => !sourcesUsed.includes(source));
    const streak = options.sourcesMissingStreak || 0;
    if (streak >= 1) {
      fail('E9', `Source(s) missing on ${streak + 1} consecutive runs: ${missing.join(', ')}`, { missing, streak });
    } else {
      warn('W2', `Source(s) missing this run: ${missing.join(', ')}. A second consecutive miss is an error.`, {
        missing,
      });
    }
  } else {
    const skuShare = safeShare(dataset.counts.skusFromCsvOnly, dataset.counts.skus);
    const mdSkuShare = safeShare(dataset.counts.skusFromMdOnly, dataset.counts.skus);
    const maxSkuShare = thresholds.maxSingleSourceSkuShare;
    for (const [label, share] of [['CSV', skuShare], ['markdown', mdSkuShare]]) {
      if (share > maxSkuShare) {
        fail(
          'E10',
          `${label} alone contributes ${(share * 100).toFixed(1)}% of SKUs (max ${(maxSkuShare * 100).toFixed(1)}%), which suggests the other source is being abandoned`,
          { share }
        );
      }
    }

    const mdEdgeShare = safeShare(dataset.counts.edgesFromMdOnly, dataset.counts.edges);
    if (mdEdgeShare > thresholds.maxSingleSourceEdgeShare) {
      warn('W3', `Markdown-only edges are ${(mdEdgeShare * 100).toFixed(1)}% of all edges`, { share: mdEdgeShare });
    }
  }

  // --- count bands vs the previous committed build -------------------------
  if (previous && previous.counts) {
    for (const [key, band] of Object.entries(DEFAULT_BANDS)) {
      const current = dataset.counts[key];
      const before = previous.counts[key];
      if (current < band.min) {
        fail('E11', `${key} dropped to ${current}, below the absolute floor of ${band.min}`, { key, current });
      }
      if (!before) continue;
      const delta = Math.abs(current - before) / before;
      if (delta > band.tolerance && !options.allowLargeChange) {
        fail(
          'E12',
          `${key} changed by ${(delta * 100).toFixed(1)}% (${before} -> ${current}), above the ${(band.tolerance * 100).toFixed(0)}% tolerance. Re-run with --allow-large-change if this is expected.`,
          { key, before, current }
        );
      }
    }

    const previousSkuIds = new Set(previous.skus.map((sku) => sku.skuId));
    const currentSkuIds = new Set(dataset.skus.map((sku) => sku.skuId));
    const disappeared = [...previousSkuIds].filter((id) => !currentSkuIds.has(id));
    const disappearedShare = safeShare(disappeared.length, previousSkuIds.size);
    if (disappearedShare > 0.02 && !options.allowLargeChange) {
      fail('E13', `${disappeared.length} previously-present SKUs disappeared (${(disappearedShare * 100).toFixed(1)}%)`, {
        examples: disappeared.slice(0, 5),
      });
    } else if (disappeared.length > 0) {
      warn('W4', `${disappeared.length} SKU(s) disappeared upstream and will be retired`, {
        examples: disappeared.slice(0, 5),
      });
    }
  } else {
    warn('W5', 'No previous dataset to compare against; count bands were not enforced');
  }

  // --- slug stability ------------------------------------------------------
  if (previousRegistry) {
    for (const kind of ['sku', 'servicePlan']) {
      try {
        assertNoSlugChurn(previousRegistry, dataset.slugRegistry, kind);
      } catch (error) {
        if (error instanceof SlugChurnError) {
          fail('E14', error.message, { changes: error.changes });
        } else {
          throw error;
        }
      }
    }
  }

  // --- quirks --------------------------------------------------------------
  validateQuirks(merged.quirks || [], allowlist, { fail, warn });

  // --- soft quality signals ------------------------------------------------
  if (dataset.counts.plansWithoutFriendlyName > thresholds.maxPlansWithoutFriendlyName) {
    warn('W6', `${dataset.counts.plansWithoutFriendlyName} plans have no distinct friendly name`, {
      count: dataset.counts.plansWithoutFriendlyName,
    });
  }
  if (dataset.counts.unresolvedIncompatibilityRefs > thresholds.maxUnresolvedIncompatibilityRefs) {
    warn('W7', `${dataset.counts.unresolvedIncompatibilityRefs} incompatibility references do not resolve to a known plan`, {
      count: dataset.counts.unresolvedIncompatibilityRefs,
    });
  }
  const whitespaceNames = dataset.servicePlans.filter((plan) => plan.technicalName && /\s/.test(plan.technicalName));
  if (whitespaceNames.length > thresholds.maxWhitespaceTechnicalNames) {
    warn('W8', `${whitespaceNames.length} technical names contain whitespace`, {
      examples: whitespaceNames.slice(0, 5).map((plan) => plan.technicalName),
    });
  }

  return { errors, warnings, ok: errors.length === 0 };
}

function validateQuirks(quirks, allowlist, { fail, warn }) {
  const buckets = {
    'guid-repair': { list: allowlist.guidRepairs || [], key: (q) => `${q.raw}|${q.rule}` },
    'name-repair': { list: allowlist.nameRepairs || [], key: (q) => q.raw },
    'unclosed-paren': { list: allowlist.unclosedParen || [], key: (q) => q.raw },
    'guid-not-last': { list: allowlist.guidNotLast || [], key: (q) => q.raw },
  };

  const seen = new Map();
  for (const quirk of quirks) {
    const bucket = buckets[quirk.kind];
    if (!bucket) {
      fail('E15', `Unrecognised quirk kind "${quirk.kind}" at line ${quirk.line}`, { quirk });
      continue;
    }
    const key = bucket.key(quirk);
    const allowed = bucket.list.some((entry) =>
      quirk.kind === 'guid-repair' ? `${entry.raw}|${entry.rule}` === key : entry.raw === key
    );
    if (!allowed) {
      // The new-malformation detector. A human decides whether this is a
      // Microsoft typo to accept or a parser bug to fix.
      fail('E16', `New ${quirk.kind} at line ${quirk.line} is not in the quirks allowlist: ${JSON.stringify(quirk.raw)}`, {
        quirk,
      });
    }
    if (!seen.has(quirk.kind)) seen.set(quirk.kind, new Set());
    seen.get(quirk.kind).add(key);
  }

  // An allowlisted quirk that stops appearing means Microsoft fixed it, and
  // the entry should be pruned deliberately rather than left to rot.
  for (const [kind, bucket] of Object.entries(buckets)) {
    for (const entry of bucket.list) {
      const key = kind === 'guid-repair' ? `${entry.raw}|${entry.rule}` : entry.raw;
      if (!(seen.get(kind) || new Set()).has(key)) {
        warn('W9', `Allowlisted ${kind} no longer appears upstream and can be pruned: ${JSON.stringify(entry.raw)}`, {
          kind,
          raw: entry.raw,
        });
      }
    }
  }
}

function reportDuplicates(values, onDuplicate) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  for (const [value, count] of counts) {
    if (count > 1) onDuplicate(value, count);
  }
}

function safeShare(part, total) {
  return total > 0 ? part / total : 0;
}

/** Render a gate result for a terminal. */
export function formatReport({ errors, warnings }) {
  const lines = [];
  if (errors.length > 0) {
    lines.push(`\n${errors.length} ERROR(S) - dataset was NOT written:`);
    errors.forEach((error, index) => lines.push(`  ${index + 1}. [${error.code}] ${error.message}`));
  }
  if (warnings.length > 0) {
    lines.push(`\n${warnings.length} warning(s):`);
    warnings.forEach((warning, index) => lines.push(`  ${index + 1}. [${warning.code}] ${warning.message}`));
  }
  if (errors.length === 0 && warnings.length === 0) lines.push('\nValidation passed with no warnings.');
  return lines.join('\n');
}
