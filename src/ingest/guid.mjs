// GUID validation and repair.
//
// The CSV never needs repair. The markdown does: it carries two known
// malformed GUIDs, one with an internal space and one that is missing a
// hyphen as well. Repair is deliberately narrow and always reports which rule
// fired, because a repair that nobody notices is a silent data corruption.
// The validation gate cross-checks every repair against an allowlist, so a
// NEW malformation stops the build rather than being quietly patched.

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX32_RE = /^[0-9a-f]{32}$/;

/** True for a canonical lowercase dashed GUID. */
export function isGuid(value) {
  return typeof value === 'string' && GUID_RE.test(value);
}

/** Insert the standard 8-4-4-4-12 hyphens into 32 hex characters. */
export function hyphenate(hex32) {
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

/**
 * Normalise a GUID, repairing the two known upstream defect shapes.
 * @param {string} rawValue
 * @returns {{guid: string|null, repaired: boolean, rule: 'none'|'lowercase'|'strip-space'|'rehyphenate'|'invalid', raw: string}}
 */
export function repairGuid(rawValue) {
  const raw = String(rawValue ?? '');
  const lower = raw.toLowerCase();

  if (GUID_RE.test(lower)) {
    const changed = lower !== raw;
    return { guid: lower, repaired: changed, rule: changed ? 'lowercase' : 'none', raw };
  }

  // "882e1d05-acd1-4ccb-8708- 6ee03664b117" -> strip the internal space.
  const noSpace = lower.replace(/\s+/g, '');
  if (GUID_RE.test(noSpace)) {
    return { guid: noSpace, repaired: true, rule: 'strip-space', raw };
  }

  // "113feb6c-3fe4-4440-bddc 54d774bf0318" -> also missing a hyphen.
  const hex = noSpace.replace(/-/g, '');
  if (HEX32_RE.test(hex)) {
    return { guid: hyphenate(hex), repaired: true, rule: 'rehyphenate', raw };
  }

  return { guid: null, repaired: false, rule: 'invalid', raw };
}

/**
 * Accept the shapes a user might paste: braces, parens, urn:uuid:, undashed,
 * any case. Used by the client search and by the /id/ route.
 */
const LOOSE_GUID_RE =
  /^(?:urn:uuid:)?[{(]?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})[)}]?$/i;

/** @returns {string|null} canonical dashed lowercase GUID, or null */
export function normaliseLooseGuid(value) {
  const match = LOOSE_GUID_RE.exec(String(value ?? '').trim());
  if (!match) return null;
  return hyphenate(match.slice(1).join('').toLowerCase());
}
