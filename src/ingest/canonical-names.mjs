// Choose one canonical name per entity from competing observed spellings.
//
// Microsoft's two files disagree with themselves and with each other. Around
// 180 service plan GUIDs carry more than one friendly name, for example
// 113feb6c-... appears as "Exchange Foundation", "EXCHANGE FOUNDATION" and
// "EXCHANGE_S_FOUNDATION". Identity is the GUID; the display name is a
// judgement call, so the rule has to be deterministic, explainable and
// published on /data/ rather than being an unaccountable preference.
//
// Determinism matters concretely: a comparator that is not a total order lets
// output drift between runs, which churns page titles and sitemap lastmod for
// no reason and trains Google to distrust the signal.

import { byCodeUnit } from '../lib/sort.mjs';

/** Loose comparison: case, underscores and spacing all treated as noise. */
export function normaliseForCompare(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim();
}

/**
 * Strict comparison: case-insensitive but separator-sensitive.
 *
 * Used to decide whether a friendly name is merely the technical name
 * repeated. "WINDOWS_10_ESU_TENANT" and "Windows 10 ESU Tenant" must NOT be
 * treated as the same here: the second is a genuinely more readable heading
 * and suppressing it would leave the page with no friendly name at all.
 */
function isSameNameStrict(a, b) {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

/**
 * Repair whitespace defects in a technical name.
 *
 * Both Microsoft files carry technical names with stray spaces, and the CSV
 * additionally carries literal "\t" escape sequences that were never
 * interpreted. Technical identifiers never legitimately contain whitespace,
 * but a space that is NOT adjacent to an underscore may indicate two names
 * fused together, so that case is deliberately left alone for the frequency
 * rule and the validation gate to deal with.
 */
export function repairTechnicalName(name) {
  const original = String(name ?? '');
  let repaired = original.replace(/\\t/g, ' ');
  // Remove whitespace that sits directly beside an underscore.
  repaired = repaired.replace(/\s*_\s*/g, '_').replace(/\s{2,}/g, ' ').trim();
  return { name: repaired, repaired: repaired !== original.trim() };
}

/**
 * Rank a candidate by how much it looks like the kind of name we are picking.
 * Lower is better.
 */
export function styleRank(name, kind) {
  const value = String(name ?? '');
  if (kind === 'technical') {
    // Technical names look like EXCHANGE_S_FOUNDATION and never contain
    // whitespace. A whitespace-bearing candidate is usually two names fused by
    // an upstream export bug, so it ranks last and loses to any clean variant.
    if (/\s/.test(value)) return 3;
    if (/^[A-Z0-9_]+$/.test(value)) return 0;
    if (value.includes('_')) return 1;
    return 2;
  }
  // Friendly names should read like prose. ALL CAPS ranks worst.
  const hasLower = /[a-z]/.test(value);
  if (hasLower && !value.includes('_')) return 0;
  if (hasLower) return 1;
  return 2;
}

/** Penalise a friendly name that just repeats the technical name. */
function distinctRank(name, otherName) {
  if (!otherName) return 0;
  return normaliseForCompare(name) === normaliseForCompare(otherName) ? 1 : 0;
}

/** Prefer a name both files agree on over one only a single file carries. */
function sourceRank(candidate, preferredSource) {
  const sources = candidate.sources || [];
  if (sources.length > 1) return 0;
  if (preferredSource && sources[0] === preferredSource) return 1;
  return 2;
}

/**
 * Pick the canonical name from a candidate list.
 *
 * @param {Array<{name: string, count: number, sources?: string[]}>} candidates
 * @param {{kind: 'technical'|'friendly'|'product', otherName?: string|null, preferredSource?: string}} options
 * @returns {string|null}
 */
export function pickCanonical(candidates, { kind, otherName = null, preferredSource = 'csv' } = {}) {
  const usable = (candidates || []).filter((candidate) => candidate && candidate.name);
  if (usable.length === 0) return null;

  const ranked = [...usable].sort(
    (a, b) =>
      // Structural quality outranks provenance. The CSV is the naming
      // authority, but it also carries export defects such as two technical
      // names fused into one cell, and a malformed name from the preferred
      // source must never beat a clean name from the other one.
      styleRank(a.name, kind) - styleRank(b.name, kind) ||
      sourceRank(a, preferredSource) - sourceRank(b, preferredSource) ||
      (b.count || 0) - (a.count || 0) ||
      distinctRank(a.name, otherName) - distinctRank(b.name, otherName) ||
      // Final tiebreak. A total order, so the result never depends on the
      // engine's sort stability or on input ordering.
      byCodeUnit(a.name, b.name)
  );

  return ranked[0].name;
}

/** Everything not chosen, deduplicated and sorted. */
export function collectAliases(candidates, chosen) {
  const aliases = new Set();
  for (const candidate of candidates || []) {
    if (!candidate || !candidate.name) continue;
    if (candidate.name === chosen) continue;
    aliases.add(candidate.name);
  }
  return [...aliases].sort(byCodeUnit);
}

/**
 * Resolve a service plan's names from its observations.
 *
 * @param {Array<{technicalName: string|null, friendlyName: string|null, source: string, retiredUpstream?: boolean}>} observations
 */
export function resolvePlanNames(observations) {
  const technical = repairTechnicalCandidates(tally(observations, 'technicalName'));
  const friendly = tally(observations, 'friendlyName');

  const technicalName = pickCanonical(technical, { kind: 'technical' });
  let friendlyName = pickCanonical(friendly, { kind: 'friendly', otherName: technicalName });

  // Some plans genuinely have no prose name; the "friendly" column just
  // repeats the technical one verbatim. Say so honestly rather than
  // fabricating a display name, and let the renderer handle it. The check is
  // deliberately case-only: a Title Case rendering of an underscore name is a
  // real improvement and must be kept.
  if (friendlyName && isSameNameStrict(friendlyName, technicalName)) {
    friendlyName = null;
  }

  return {
    technicalName,
    friendlyName,
    aliases: {
      // A technical alias containing whitespace is an upstream defect, not a
      // real alternative spelling, so it is dropped rather than published as
      // an "also appears as" on the page. Kept only when the canonical name
      // itself has whitespace, which is the case for the handful of plans
      // where Microsoft put a prose name in the technical column.
      technical: collectAliases(technical, technicalName).filter(
        (alias) => !/\s/.test(alias) || /\s/.test(technicalName || '')
      ),
      friendly: collectAliases(friendly, friendlyName),
    },
    retiredUpstream: observations.some((observation) => observation.retiredUpstream === true),
    sources: [...new Set(observations.map((observation) => observation.source))].sort(byCodeUnit),
    observations: observations.length,
  };
}

/**
 * Apply whitespace repair to technical candidates and re-merge any that
 * collapse onto the same value, so a repaired variant does not resurface as a
 * near-duplicate alias.
 */
function repairTechnicalCandidates(candidates) {
  const merged = new Map();
  for (const candidate of candidates) {
    const { name } = repairTechnicalName(candidate.name);
    if (!name) continue;
    const existing = merged.get(name);
    if (existing) {
      existing.count += candidate.count;
      for (const source of candidate.sources) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      }
    } else {
      merged.set(name, { ...candidate, name, sources: [...candidate.sources] });
    }
  }
  return [...merged.values()]
    .map((entry) => ({ ...entry, sources: entry.sources.sort(byCodeUnit) }))
    .sort((a, b) => byCodeUnit(a.name, b.name));
}

/** Count distinct values of a field across observations, tracking sources. */
function tally(observations, field) {
  const counts = new Map();
  for (const observation of observations) {
    const name = observation[field];
    if (!name) continue;
    const existing = counts.get(name);
    if (existing) {
      existing.count += 1;
      if (!existing.sources.includes(observation.source)) existing.sources.push(observation.source);
    } else {
      counts.set(name, { name, count: 1, sources: [observation.source] });
    }
  }
  // Materialise and sort rather than relying on Map insertion order.
  return [...counts.values()]
    .map((entry) => ({ ...entry, sources: entry.sources.sort(byCodeUnit) }))
    .sort((a, b) => byCodeUnit(a.name, b.name));
}
