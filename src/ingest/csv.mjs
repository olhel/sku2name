// RFC 4180 CSV reader.
//
// Hand-rolled rather than pulled from npm: the whole reader is 40 lines, and
// the input is a single known file whose exact quirks are covered by tests.
// Handles quoted fields, escaped "" inside quotes, embedded commas and
// newlines, and both CRLF and LF line endings.

/**
 * @param {string} text
 * @returns {string[][]} rows of raw (untrimmed) cell values
 */
export function parseCsvRows(text) {
  const input = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let cellStarted = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    cellStarted = false;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char !== '"') {
        cell += char;
      } else if (input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      // Swallow CR; the following LF ends the row. A lone CR also ends it.
      if (input[i + 1] !== '\n') endRow();
    } else {
      cell += char;
      cellStarted = true;
    }
  }

  // Trailing cell, unless the file ended exactly on a row boundary.
  if (cell !== '' || row.length > 0) endRow();

  // Drop rows that are entirely empty (a trailing newline produces one).
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

/**
 * Read a CSV into objects keyed by header name.
 * @param {string} text
 * @returns {{header: string[], rows: Array<{cells: string[], values: Record<string,string>, line: number}>}}
 */
export function parseCsvTable(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { header: [], rows: [] };

  const header = rows[0].map((value) => value.trim());
  const out = rows.slice(1).map((cells, index) => {
    const values = {};
    header.forEach((name, column) => {
      values[name] = (cells[column] ?? '').trim();
    });
    // +2: one for the header row, one to make it 1-indexed like an editor.
    return { cells, values, line: index + 2 };
  });

  return { header, rows: out };
}
