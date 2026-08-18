// URL slug generation.
//
// Slugs deliberately PRESERVE underscores. Microsoft's identifiers are
// underscore-separated (EXCHANGE_S_ENTERPRISE, SPE_E5) and that is exactly
// what an admin pastes into a search box or a ticket, so /service-plan/
// exchange_s_enterprise is both more recognisable and more searchable than a
// hyphenated variant would be. Everything that is not [a-z0-9_] collapses to
// a hyphen, which is what makes the URL-hostile String IDs safe.

const DEFAULT_MAX_LENGTH = 60;

// Unicode combining marks, stripped after NFKD so accented product names
// reduce to ASCII rather than dropping characters entirely.
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * @param {string} input
 * @param {{maxLength?: number}} [options]
 * @returns {string} a slug safe to use as a single URL path segment, possibly empty
 */
export function slugify(input, { maxLength = DEFAULT_MAX_LENGTH } = {}) {
  const slug = String(input ?? '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    // Collapse runs of separators. A run containing an underscore becomes an
    // underscore, so "basic_(no Teams)" -> "basic_-no-teams-" -> "basic_no-teams".
    .replace(/[-_]{2,}/g, (run) => (run.includes('_') ? '_' : '-'))
    .replace(/^[-_]+|[-_]+$/g, '');

  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/[-_]+$/, '');
}

/** True when a slug is usable as a URL path segment without percent-encoding. */
export function isCleanSlug(slug) {
  return typeof slug === 'string' && slug.length > 0 && /^[a-z0-9_]+(?:[-_][a-z0-9_]+)*$/.test(slug);
}
