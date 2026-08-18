// Document structure: frontmatter, dates, headings, and locating the tables.
//
// The main product table is selected by its HEADER SIGNATURE rather than by
// position. That single decision makes the two-column "cannot be assigned at
// the same time" tables structurally unselectable as products, and it means a
// Microsoft restructure fails the build instead of silently parsing the wrong
// table.

import { cleanCell, findTables } from './markdown-tables.mjs';

export const MAIN_TABLE_HEADER = [
  'product name',
  'string id',
  'guid',
  'service plans included',
  'service plans included (friendly names)',
];

const INCOMPATIBILITY_HEADING = /^#{2,3}\s+Service plans that cannot be assigned at the same time/i;
const NEXT_STEPS_HEADING = /^#{2,3}\s+Next steps/i;
const SERVICE_HEADING = /^#{3,4}\s+Service:\s*\*?(.+?)\*?\s*$/i;

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export class MainTableNotFoundError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MainTableNotFoundError';
    this.details = details;
  }
}

/** Split YAML frontmatter from the body without a YAML dependency. */
export function splitFrontMatter(text) {
  const normalised = String(text ?? '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalised);
  if (!match) return { frontMatter: '', body: normalised };
  return { frontMatter: match[1], body: normalised.slice(match[0].length) };
}

/**
 * Read `ms.date` and normalise to ISO.
 *
 * Never `new Date(string)`: it is locale- and version-sensitive, and this
 * value reaches the sitemap, where a wobble reads as a fake sitewide update.
 */
export function readMsDate(frontMatter) {
  const match = /^ms\.date:\s*(.+)$/m.exec(String(frontMatter ?? ''));
  if (!match) return null;
  const value = match[1].trim().replace(/^["']|["']$/g, '');

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slash) {
    const [, month, day, year] = slash;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return iso ? value : null;
}

/** Read the "This information was last updated on August 14, 2026." note. */
export function readLastUpdatedNote(body) {
  const match = /last updated on\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(String(body ?? ''));
  if (!match) return null;
  const [, monthName, day, year] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return { iso: `${year}-${month}-${day.padStart(2, '0')}`, raw: `${monthName} ${day}, ${year}` };
}

/** Index of the first line matching a heading pattern, or -1. */
function findHeading(lines, pattern) {
  return lines.findIndex((line) => pattern.test(line));
}

/**
 * Locate the main product table by header signature.
 * @throws {MainTableNotFoundError} when zero or more than one table matches
 */
export function locateMainTable(lines) {
  const incompatibilityAt = findHeading(lines, INCOMPATIBILITY_HEADING);
  const limit = incompatibilityAt === -1 ? lines.length : incompatibilityAt;

  const matches = findTables(lines, 0, limit).filter((table) => {
    const signature = table.headerCells.map((cell) => cleanCell(cell).toLowerCase());
    return (
      signature.length === MAIN_TABLE_HEADER.length &&
      signature.every((cell, index) => cell === MAIN_TABLE_HEADER[index])
    );
  });

  if (matches.length === 0) {
    throw new MainTableNotFoundError('No table matched the expected product-table header signature', {
      expected: MAIN_TABLE_HEADER,
    });
  }
  if (matches.length > 1) {
    throw new MainTableNotFoundError(`Expected exactly one product table, found ${matches.length}`, {
      startLines: matches.map((table) => table.startLine),
    });
  }
  return matches[0];
}

/**
 * Locate the per-service "cannot be assigned at the same time" tables.
 * Returns [] when the section is absent, which is not an error.
 */
export function locateIncompatibilitySections(lines) {
  const start = findHeading(lines, INCOMPATIBILITY_HEADING);
  if (start === -1) return [];

  const nextSteps = findHeading(lines, NEXT_STEPS_HEADING);
  const end = nextSteps > start ? nextSteps : lines.length;

  const sections = [];
  for (let index = start; index < end; index += 1) {
    const heading = SERVICE_HEADING.exec(lines[index]);
    if (!heading) continue;

    let stop = index + 1;
    while (stop < end && !SERVICE_HEADING.test(lines[stop])) stop += 1;

    const [table] = findTables(lines, index, stop);
    if (table) sections.push({ service: cleanCell(heading[1]), table });
  }
  return sections;
}
