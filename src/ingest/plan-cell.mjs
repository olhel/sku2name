// Parse a "service plans included" cell.
//
// Each cell holds one or more `NAME (guid)` entries separated by <br/>. Two
// details make this less trivial than it looks:
//
//  1. Friendly names contain their own parentheses, for example
//     "Microsoft Application Protection and Governance (A) (5f3b1ded-...)".
//     The GUID is the LAST parenthesized group, not the first. Taking the
//     first would yield the name "...and Governance" and the "GUID" "A".
//
//  2. At least one entry carries an unbalanced trailing paren,
//     "RMS_S_ENTERPRISE)", which has to be repaired and reported.

import { cleanCell } from './markdown-tables.mjs';
import { repairGuid } from './guid.mjs';

const BR = /<\s*br\s*\/?\s*>/gi;

// Every balanced (...) group, with its position.
const PAREN_GROUP = /\(([^()]*)\)/g;

// A trailing group whose closing paren is missing entirely, as in
// "Whiteboard (Plan 2) (94a54592-cd8b-425e-87c6-97868b000b91".
const UNCLOSED_TAIL = /\(([0-9a-fA-F][0-9a-fA-F\s-]*)$/;

function countChar(text, char) {
  let total = 0;
  for (const c of text) if (c === char) total += 1;
  return total;
}

/** Split a cell into raw entries. The split happens BEFORE cleaning. */
export function splitPlanEntries(cell) {
  return String(cell ?? '')
    .split(BR)
    .map((entry) => cleanCell(entry))
    .filter((entry) => entry !== '');
}

/** Strip unbalanced trailing parens, reporting whether anything was removed. */
export function repairName(name) {
  let out = String(name ?? '').trim();
  let repaired = false;
  while (out.endsWith(')') && countChar(out, '(') < countChar(out, ')')) {
    out = out.slice(0, -1).trim();
    repaired = true;
  }
  return { name: out, nameRepaired: repaired };
}

/**
 * Find the GUID inside an entry.
 *
 * Scans parenthesized groups from RIGHT to LEFT and takes the first that is a
 * GUID. Rightmost-first is what makes "Governance (A) (5f3b1ded-...)" work,
 * where the name carries its own parens. Continuing leftward past a non-GUID
 * group is what makes "...(93d24177-...) (PRIVACY_MANGEMENT_DSR_EXCHANGE_1)"
 * work, where the technical name was appended after the GUID.
 */
function extractGuid(raw) {
  const groups = [];
  PAREN_GROUP.lastIndex = 0;
  let match;
  while ((match = PAREN_GROUP.exec(raw)) !== null) {
    groups.push({ value: match[1], start: match.index, end: match.index + match[0].length });
  }

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const repaired = repairGuid(groups[index].value);
    if (repaired.guid) {
      return {
        guid: repaired,
        namePart: raw.slice(0, groups[index].start),
        trailing: raw.slice(groups[index].end).trim(),
        positionFromEnd: groups.length - 1 - index,
      };
    }
  }

  const unclosed = UNCLOSED_TAIL.exec(raw);
  if (unclosed) {
    const repaired = repairGuid(unclosed[1]);
    if (repaired.guid) {
      return {
        guid: repaired,
        namePart: raw.slice(0, unclosed.index),
        trailing: '',
        positionFromEnd: 0,
        unclosedParen: true,
      };
    }
  }

  return null;
}

/**
 * @param {string} entry one `NAME (guid)` entry
 * @param {object} [context] carried into issues so warnings can point at a line
 */
export function parsePlanEntry(entry, context = {}) {
  const raw = String(entry ?? '').trim();
  const found = extractGuid(raw);

  if (!found) {
    return { raw, name: raw, guid: null, guidRaw: null, error: 'no-guid-parens', ...context };
  }

  const { name, nameRepaired } = repairName(found.namePart);

  return {
    raw,
    name,
    nameRepaired,
    guid: found.guid.guid,
    guidRaw: found.guid.raw,
    guidRepaired: found.guid.repaired,
    guidRule: found.guid.rule,
    // Anything other than a clean trailing GUID is reported so the validation
    // gate can distinguish a known upstream defect from a new one.
    guidNotLast: found.positionFromEnd > 0 ? found.trailing : null,
    unclosedParen: found.unclosedParen === true,
    error: null,
    ...context,
  };
}

/** Parse a whole cell into entries, preserving document order. */
export function parsePlanCell(cell, context = {}) {
  return splitPlanEntries(cell).map((entry, index) => parsePlanEntry(entry, { ...context, index }));
}
