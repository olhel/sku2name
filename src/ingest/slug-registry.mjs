// Slug assignment and the URL stability guarantee.
//
// The single most important SEO decision in this project: URLs are pinned to
// GUIDs in a committed registry, NOT derived from names at build time.
// Microsoft renames products in place (Power Virtual Agents became Copilot
// Studio), and a name-derived URL would silently 404 every external link the
// moment that happened.
//
// Rules, in order:
//   1. Incumbency always wins. An existing GUID keeps its slug forever.
//   2. New GUIDs are processed in ascending GUID order, so a rebuild from
//      scratch is reproducible.
//   3. A base slug contested by two NEW entities gives the bare slug to
//      neither. Both get suffixed and the bare slug becomes a disambiguation
//      page. This is the MCOPSTN5 case, where one String ID is used by two
//      different products, and a disambiguation page is what the person who
//      pasted it actually needs.
//   4. A newcomer never displaces an incumbent.
//   5. Retired slugs are never reused.

import { byCodeUnit } from '../lib/sort.mjs';
import { slugify } from '../lib/slugify.mjs';

export const SLUG_REGISTRY_VERSION = 1;

export function emptyRegistry() {
  return {
    schemaVersion: SLUG_REGISTRY_VERSION,
    sku: {},
    servicePlan: {},
    disambiguation: { sku: {}, servicePlan: {} },
  };
}

export class SlugChurnError extends Error {
  constructor(changes) {
    super(
      `Registry-pinned slugs would change for ${changes.length} entity(ies): ` +
        changes.map((c) => `${c.guid} ${c.from} -> ${c.to}`).join(', ')
    );
    this.name = 'SlugChurnError';
    this.changes = changes;
  }
}

/**
 * Assign slugs to entities of one kind.
 *
 * @param {Array<{guid: string, base: string, disambiguator?: string}>} entities
 * @param {object} registry mutated copy is returned, input is not modified
 * @param {'sku'|'servicePlan'} kind
 * @param {{firstSeen?: string}} [options] firstSeen must be supplied by the
 *   caller rather than read from a clock, so ingest stays a pure-ish function
 *   and repeated runs are reproducible.
 */
export function assignSlugs(entities, registry, kind, { firstSeen = null } = {}) {
  const next = {
    ...emptyRegistry(),
    ...registry,
    sku: { ...(registry.sku || {}) },
    servicePlan: { ...(registry.servicePlan || {}) },
    disambiguation: {
      sku: { ...((registry.disambiguation || {}).sku || {}) },
      servicePlan: { ...((registry.disambiguation || {}).servicePlan || {}) },
    },
  };

  const entries = next[kind];
  const assignments = new Map();
  const changes = [];
  const minted = [];

  // Every slug ever issued for this kind, including retired ones.
  const taken = new Map();
  for (const [guid, record] of Object.entries(entries)) {
    taken.set(record.slug, guid);
  }

  const sorted = [...entities].sort((a, b) => byCodeUnit(a.guid, b.guid));

  // Pass 1: incumbents keep their slugs, unconditionally.
  const newcomers = [];
  for (const entity of sorted) {
    const incumbent = entries[entity.guid];
    if (incumbent) {
      assignments.set(entity.guid, incumbent.slug);
      if (incumbent.retired) {
        entries[entity.guid] = { ...incumbent, retired: false, retiredOn: null };
      }
    } else {
      newcomers.push(entity);
    }
  }

  // Pass 2: group newcomers by the base slug they want, so a slug contested at
  // first mint can be detected before anything is assigned.
  const wanted = new Map();
  for (const entity of newcomers) {
    const base = normaliseBase(entity, kind);
    if (!wanted.has(base)) wanted.set(base, []);
    wanted.get(base).push(entity);
  }

  for (const base of [...wanted.keys()].sort(byCodeUnit)) {
    const contenders = wanted.get(base);
    const baseIsFree = !taken.has(base);

    if (contenders.length === 1 && baseIsFree) {
      claim(contenders[0].guid, base);
      continue;
    }

    // Contested, either by each other or by an incumbent. Nobody gets the bare
    // slug; every contender is suffixed so no URL is ambiguous.
    //
    // Use the readable disambiguator only when it separates EVERY contender.
    // Two plans can share both a technical and a friendly name and differ only
    // by GUID, and in that case a name-based suffix would be both ambiguous
    // and misleading, so the whole group falls back to GUIDs together rather
    // than ending up with an inconsistent mix.
    const useNames = disambiguatorsAreDistinct(contenders, base, taken);
    for (const entity of contenders) {
      claim(entity.guid, mintSuffixed(entity, base, taken, useNames));
    }

    if (contenders.length > 1 && baseIsFree) {
      next.disambiguation[kind][base] = contenders
        .map((entity) => entity.guid)
        .sort(byCodeUnit);
    }
  }

  function claim(guid, slug) {
    taken.set(slug, guid);
    assignments.set(guid, slug);
    entries[guid] = { slug, firstSeen, retired: false };
    minted.push({ guid, slug });
  }

  // Retire anything in the registry that is no longer present upstream. The
  // slug stays reserved so it can 301 or serve a tombstone rather than 404.
  const present = new Set(entities.map((entity) => entity.guid));
  const retired = [];
  for (const [guid, record] of Object.entries(entries)) {
    if (present.has(guid) || record.retired) continue;
    entries[guid] = { ...record, retired: true, retiredOn: firstSeen };
    retired.push({ guid, slug: record.slug });
  }

  return { registry: next, assignments, minted, retired, changes };
}

function normaliseBase(entity, kind) {
  const base = slugify(entity.base || '');
  if (base) return base;
  const fallback = slugify(entity.disambiguator || '');
  if (fallback) return fallback;
  return `${kind === 'sku' ? 'sku' : 'plan'}-${entity.guid.slice(0, 8)}`;
}

/** True when every contender's name-based slug is distinct and unclaimed. */
function disambiguatorsAreDistinct(contenders, base, taken) {
  const seen = new Set();
  for (const entity of contenders) {
    const disambiguator = slugify(entity.disambiguator || '');
    if (!disambiguator) return false;
    const candidate = trimSlug(`${base}-${disambiguator}`);
    if (candidate === base || taken.has(candidate) || seen.has(candidate)) return false;
    seen.add(candidate);
  }
  return true;
}

function mintSuffixed(entity, base, taken, useNames = true) {
  const disambiguator = useNames ? slugify(entity.disambiguator || '') : '';
  if (disambiguator) {
    const candidate = trimSlug(`${base}-${disambiguator}`);
    if (candidate !== base && !taken.has(candidate)) return candidate;
  }
  const withGuid = trimSlug(`${base}-${entity.guid.slice(0, 8)}`);
  if (!taken.has(withGuid)) return withGuid;
  // GUIDs are unique, so this always terminates.
  return `${base}-${entity.guid.replace(/-/g, '').slice(0, 12)}`;
}

function trimSlug(value, maxLength = 130) {
  return value.length <= maxLength ? value : value.slice(0, maxLength).replace(/[-_]+$/, '');
}

/**
 * Verify that no already-pinned slug would change under a fresh assignment.
 * This is the SEO tripwire and it is unconditional.
 *
 * @throws {SlugChurnError}
 */
export function assertNoSlugChurn(previousRegistry, nextRegistry, kind) {
  const before = (previousRegistry || {})[kind] || {};
  const after = (nextRegistry || {})[kind] || {};
  const changes = [];
  for (const [guid, record] of Object.entries(before)) {
    const updated = after[guid];
    if (updated && updated.slug !== record.slug) {
      changes.push({ guid, from: record.slug, to: updated.slug });
    }
  }
  if (changes.length > 0) throw new SlugChurnError(changes);
  return true;
}
