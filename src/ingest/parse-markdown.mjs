// Parse Microsoft's markdown reference into a RawDataset.
//
// This is the SECONDARY source. The CSV supplies almost everything; the
// markdown exists in the pipeline for four reasons the CSV cannot cover:
//
//   1. Entities the CSV is missing (both Windows 10 ESU SKUs, among others).
//   2. The "cannot be assigned at the same time" tables.
//   3. ms.date and the human "last updated" note.
//   4. Provenance: it lives in a public git repo, so a change is attributable
//      to a commit. The CSV is an opaque blob on a CDN.
//
// Pure function: no I/O, no network, no clock.

import { repairGuid } from './guid.mjs';
import { parsePlanCell } from './plan-cell.mjs';
import { pairPlanColumns } from './pair-columns.mjs';
import {
  locateMainTable,
  locateIncompatibilitySections,
  readLastUpdatedNote,
  readMsDate,
  splitFrontMatter,
} from './sections.mjs';

export class MarkdownParseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MarkdownParseError';
    this.details = details;
  }
}

const MAIN_TABLE_COLUMNS = 5;

/**
 * @param {string} text raw markdown
 * @returns {object} RawDataset
 */
export function parseMarkdownSource(text) {
  const { frontMatter, body } = splitFrontMatter(text);
  const lines = body.split('\n');

  const table = locateMainTable(lines);
  const issues = [];
  const quirks = [];
  const skus = [];
  const planObservations = [];

  for (const { cells, line } of table.rows) {
    // A row with the wrong arity is an error, not something to skip: a
    // silently skipped row is a page that quietly stops existing.
    if (cells.length !== MAIN_TABLE_COLUMNS) {
      throw new MarkdownParseError(
        `Product table row at line ${line} has ${cells.length} cells, expected ${MAIN_TABLE_COLUMNS}`,
        { line, cells }
      );
    }

    const [productName, stringId, skuGuidRaw, technicalCell, friendlyCell] = cells;
    const skuGuid = repairGuid(skuGuidRaw);

    if (!skuGuid.guid) {
      issues.push({ kind: 'invalid-sku-guid', source: 'md', line, stringId, raw: skuGuidRaw });
      continue;
    }
    if (skuGuid.repaired) {
      quirks.push({ kind: 'guid-repair', source: 'md', line, raw: skuGuid.raw, rule: skuGuid.rule, repaired: skuGuid.guid });
    }

    const technical = parsePlanCell(technicalCell, { line, column: 'technical' });
    const friendly = parsePlanCell(friendlyCell, { line, column: 'friendly' });

    for (const entry of [...technical, ...friendly]) {
      if (entry.guidRepaired) {
        quirks.push({ kind: 'guid-repair', source: 'md', line, raw: entry.guidRaw, rule: entry.guidRule, repaired: entry.guid });
      }
      if (entry.nameRepaired) {
        quirks.push({ kind: 'name-repair', source: 'md', line, raw: entry.raw, repaired: entry.name });
      }
      if (entry.unclosedParen) {
        quirks.push({ kind: 'unclosed-paren', source: 'md', line, raw: entry.raw, repaired: entry.guid });
      }
      if (entry.guidNotLast) {
        quirks.push({ kind: 'guid-not-last', source: 'md', line, raw: entry.raw, trailing: entry.guidNotLast });
      }
      if (entry.error) {
        issues.push({ kind: entry.error, source: 'md', line, column: entry.column, raw: entry.raw });
      }
    }

    const { plans, issues: pairingIssues } = pairPlanColumns(
      technical.filter((entry) => entry.guid),
      friendly.filter((entry) => entry.guid),
      { source: 'md', line, stringId }
    );
    issues.push(...pairingIssues);

    const servicePlanIds = [];
    for (const plan of plans) {
      if (!plan.guid) continue;
      // The technical column decides membership. A friendly-only entry may
      // still contribute a display name, but it must never create an edge:
      // the Microsoft Copilot for Microsoft 365 row carries
      // "Microsoft Sales Copilot (3227bcb2-...)" in its friendly-names
      // column, and that GUID is the SKU GUID of Microsoft_Viva_Sales.
      // Treated as an edge it invented a service plan that does not exist,
      // whose page title read "Microsoft Sales Copilot (null)".
      if (plan.pairing !== 'friendly-only') {
        if (!servicePlanIds.includes(plan.guid)) servicePlanIds.push(plan.guid);
      }
      planObservations.push({
        planId: plan.guid,
        technicalName: plan.technicalName,
        friendlyName: plan.friendlyName,
        retiredUpstream: false,
        pairing: plan.pairing,
        skuId: skuGuid.guid,
        source: 'md',
        line,
      });
    }

    skus.push({
      skuId: skuGuid.guid,
      productNames: productName ? [{ name: productName, count: 1 }] : [],
      stringIds: stringId ? [{ name: stringId, count: 1 }] : [],
      servicePlanIds,
      line,
    });
  }

  return {
    source: 'md',
    skus,
    planObservations,
    incompatibilityGroups: parseIncompatibilityGroups(lines, issues),
    document: {
      msDate: readMsDate(frontMatter),
      ...normaliseLastUpdated(readLastUpdatedNote(body)),
    },
    issues,
    quirks,
    counts: {
      rows: table.rows.length,
      skus: skus.length,
      servicePlans: new Set(planObservations.map((observation) => observation.planId)).size,
      edges: skus.reduce((total, sku) => total + sku.servicePlanIds.length, 0),
      guidRepairs: quirks.filter((quirk) => quirk.kind === 'guid-repair').length,
      nameRepairs: quirks.filter((quirk) => quirk.kind === 'name-repair').length,
      indexPairings: issues.filter((issue) => issue.kind === 'index-pairing').length,
      orphanFriendly: issues.filter((issue) => issue.kind === 'orphan-friendly').length,
    },
  };
}

function normaliseLastUpdated(note) {
  if (!note) return { lastUpdated: null, lastUpdatedRaw: null };
  return { lastUpdated: note.iso, lastUpdatedRaw: note.raw };
}

function parseIncompatibilityGroups(lines, issues) {
  return locateIncompatibilitySections(lines).map(({ service, table }) => {
    const members = [];
    for (const { cells, line } of table.rows) {
      if (cells.length < 2) continue;
      const [name, guidRaw] = cells;
      const guid = repairGuid(guidRaw);
      if (!guid.guid) {
        issues.push({ kind: 'invalid-incompatibility-guid', source: 'md', line, service, raw: guidRaw });
        continue;
      }
      members.push({ name, planId: guid.guid, line });
    }
    return { service, members };
  });
}
