// Deterministic JSON serialisation.
//
// Keys are emitted in code-unit order at every level, so two runs over
// equivalent data produce byte-identical output regardless of the order in
// which properties happened to be assigned.

import { byCodeUnit } from './sort.mjs';

function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort(byCodeUnit)) {
      if (value[key] === undefined) continue;
      out[key] = normalise(value[key]);
    }
    return out;
  }
  return value;
}

/** Stringify with sorted keys, 2-space indent, and a trailing newline. */
export function stableStringify(value, { indent = 2 } = {}) {
  return JSON.stringify(normalise(value), null, indent) + '\n';
}

/** Stringify with sorted keys and no whitespace. For hashing and for shipped payloads. */
export function compactStringify(value) {
  return JSON.stringify(normalise(value));
}
