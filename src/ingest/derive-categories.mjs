// Derived presentation categories.
//
// IMPORTANT: these are sku2name's own labels, inferred from naming patterns.
// They are NOT Microsoft fields and Microsoft does not publish them. Every
// surface that shows them must say so and link to /data/#derived. They exist
// for navigation and filtering, never as an authoritative claim about a
// license.
//
// Each rule states the exact pattern it matches so the /data/ page can render
// this table straight from the code rather than from a prose description that
// drifts out of date.

export const CATEGORY_RULES = [
  {
    id: 'education',
    label: 'Education',
    describe: 'String ID or product name mentions EDU, faculty, student, or academic',
    test: ({ stringId, productName }) =>
      /(^|_)(EDU|EDUCATION|FACULTY|STUDENT|STUDENTS|ACADEMIC)(_|$)/i.test(stringId) ||
      /\b(for (faculty|students)|academic|education edition)\b/i.test(productName),
  },
  {
    id: 'faculty',
    label: 'Faculty',
    describe: 'String ID or product name specifically mentions faculty',
    test: ({ stringId, productName }) => /faculty/i.test(stringId) || /\bfor faculty\b/i.test(productName),
  },
  {
    id: 'student',
    label: 'Student',
    describe: 'String ID or product name specifically mentions students',
    test: ({ stringId, productName }) => /student/i.test(stringId) || /\bfor students\b/i.test(productName),
  },
  {
    id: 'government',
    label: 'Government',
    describe: 'String ID or product name mentions GOV, GCC, DOD, or government',
    test: ({ stringId, productName }) =>
      /(^|_)(GOV|GCC|GCCHIGH|DOD|USGOV)(_|HIGH|$)/i.test(stringId) ||
      /\b(government|gcc|dod)\b/i.test(productName),
  },
  {
    id: 'trial',
    label: 'Trial',
    describe: 'String ID or product name mentions trial, viral, or preview',
    test: ({ stringId, productName }) =>
      /(^|_)(TRIAL|VIRAL|PREVIEW|PRIVPREV)(_|$)/i.test(stringId) ||
      /\b(trial|preview)\b/i.test(productName),
  },
  {
    id: 'addon',
    label: 'Add-on',
    describe: 'String ID or product name mentions add-on or capacity pack',
    test: ({ stringId, productName }) =>
      /(^|_)ADDON(_|$)/i.test(stringId) || /\b(add-?on|capacity pack)\b/i.test(productName),
  },
  {
    id: 'eea-no-teams',
    label: 'EEA (no Teams)',
    describe: 'Product name or String ID marks the EEA unbundled-Teams variant',
    test: ({ stringId, productName }) =>
      /no[_ ]?teams/i.test(stringId) || /\(no Teams\)|\bEEA\b/i.test(productName) || /w\/o Teams/i.test(stringId),
  },
  {
    id: 'nonprofit',
    label: 'Nonprofit',
    describe: 'String ID or product name mentions nonprofit or charity',
    test: ({ stringId, productName }) =>
      /(^|_)(NONPROFIT|NFP|CHARITY)(_|$)/i.test(stringId) || /\b(nonprofit|non-profit|charity)\b/i.test(productName),
  },
];

/**
 * @param {{stringId?: string, productName?: string}} sku
 * @returns {string[]} category ids, in rule order
 */
export function deriveCategories({ stringId = '', productName = '' } = {}) {
  const input = { stringId: String(stringId || ''), productName: String(productName || '') };
  return CATEGORY_RULES.filter((rule) => rule.test(input)).map((rule) => rule.id);
}

/** The rule table, for rendering on /data/#derived. */
export function categoryTable() {
  return CATEGORY_RULES.map(({ id, label, describe }) => ({ id, label, describe }));
}
