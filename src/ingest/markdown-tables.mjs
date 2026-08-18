// Markdown table mechanics: finding tables, splitting rows, cleaning cells.
//
// Microsoft's reference is hand-maintained, so cells carry stray tabs,
// non-breaking spaces and inconsistent padding. None of that is meaningful,
// but all of it has to be removed before values are compared.

/**
 * Clean a scalar cell value.
 *
 * Note the ordering constraint elsewhere: for service-plan cells the <br/>
 * split MUST happen before cleaning, because collapsing whitespace across a
 * <br/> boundary would fuse two plan entries into one.
 */
export function cleanCell(value) {
  return String(value ?? '')
    .replace(/[\t ​‌‍﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split one markdown table row into cells.
 *
 * Drops a single leading and trailing pipe, then splits on unescaped pipes.
 * The dataset has no escaped pipes today; the lookbehind costs nothing and
 * prevents a future silent corruption.
 */
export function splitRow(line) {
  const trimmed = String(line ?? '').trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEdges.split(/(?<!\\)\|/).map((cell) => cleanCell(cell.replace(/\\\|/g, '|')));
}

/** True for a markdown table delimiter row such as `| --- | :--- |`. */
export function isDelimiterRow(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  return /^\|?[\s:|-]+\|[\s:|-]*$/.test(trimmed);
}

function isTableLine(line) {
  return typeof line === 'string' && line.includes('|');
}

/**
 * Find every markdown table within a line range.
 *
 * A table starts at a line containing a pipe that is immediately followed by a
 * delimiter row, and ends at the first blank line or first line without a pipe.
 *
 * @param {string[]} lines
 * @param {number} [from] inclusive 0-based index
 * @param {number} [to] exclusive 0-based index
 */
export function findTables(lines, from = 0, to = lines.length) {
  const tables = [];
  let index = from;

  while (index < to - 1) {
    if (!isTableLine(lines[index]) || !isDelimiterRow(lines[index + 1])) {
      index += 1;
      continue;
    }

    const headerCells = splitRow(lines[index]);
    const startLine = index;
    const rows = [];
    let cursor = index + 2;

    while (cursor < to && isTableLine(lines[cursor]) && lines[cursor].trim() !== '') {
      rows.push({ cells: splitRow(lines[cursor]), line: cursor + 1 });
      cursor += 1;
    }

    tables.push({ headerCells, rows, startLine: startLine + 1, endLine: cursor });
    index = cursor;
  }

  return tables;
}
