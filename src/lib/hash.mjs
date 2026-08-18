import { createHash } from 'node:crypto';
import { compactStringify } from './stable-json.mjs';

/** sha256 of a string or buffer, hex encoded. */
export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

/** sha256 of a value's stable serialisation. Order-independent by construction. */
export function hashValue(value) {
  return sha256(compactStringify(value));
}

/** Short hash for cache-busting filenames. */
export function shortHash(input, length = 8) {
  return sha256(input).slice(0, length);
}

/**
 * Normalise text before hashing so line-ending and trailing-whitespace churn
 * does not read as a content change.
 */
export function normalisedTextHash(text) {
  const normalised = String(text)
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '\n');
  return sha256(normalised);
}
