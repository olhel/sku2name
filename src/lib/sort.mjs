// Total ordering helpers.
//
// Every comparator here is code-unit based. localeCompare and Intl are
// deliberately never used anywhere in this codebase: their results vary by
// ICU version and by locale, which would make builds non-deterministic
// across machines and across Node upgrades.

/** Compare two strings by UTF-16 code unit. A total order over distinct strings. */
export function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Comparator factory: sort objects by a string-valued key, code-unit order. */
export function byKey(key) {
  return (a, b) => byCodeUnit(String(a[key]), String(b[key]));
}

/** Sort a copy of an array of strings. */
export function sortedStrings(values) {
  return [...values].sort(byCodeUnit);
}

/** Deduplicate (case-sensitively) and sort. */
export function uniqueSorted(values) {
  return sortedStrings(new Set(values));
}
