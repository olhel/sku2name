// Parse Microsoft's CSV export into a RawDataset.
//
// This is the primary source. It is already edge-normalized (one row per
// SKU/service-plan pair) and carries a dedicated Service_Plan_Id column, so
// none of the markdown's parsing hazards exist here: no <br/> splitting, no
// GUID-inside-free-text extraction, no paired columns to misalign.
//
// Strictness is deliberate. A CSV that arrives as an HTML error page, or with
// a changed header, must fail loudly rather than parse into a plausible-
// looking empty dataset.

import { parseCsvTable } from './csv.mjs';
import { isGuid, repairGuid } from './guid.mjs';

export const CSV_HEADER = [
  'Product_Display_Name',
  'String_Id',
  'GUID',
  'Service_Plan_Name',
  'Service_Plan_Id',
  'Service_Plans_Included_Friendly_Names',
];

const RETIRED_PREFIX = /^RETIRED\s*[-–—]\s*/i;

export class CsvParseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CsvParseError';
    this.details = details;
  }
}

/** Split a "RETIRED - Name" friendly name into its flag and its name. */
export function splitRetired(name) {
  const value = String(name ?? '').trim();
  if (!RETIRED_PREFIX.test(value)) return { name: value, retiredUpstream: false };
  return { name: value.replace(RETIRED_PREFIX, '').trim(), retiredUpstream: true };
}

/**
 * @param {string} text raw CSV
 * @returns {object} RawDataset
 */
export function parseCsvSource(text) {
  const { header, rows } = parseCsvTable(text);

  if (header.length !== CSV_HEADER.length || header.some((name, i) => name !== CSV_HEADER[i])) {
    throw new CsvParseError('CSV header does not match the expected columns', {
      expected: CSV_HEADER,
      actual: header,
    });
  }
  if (rows.length === 0) {
    throw new CsvParseError('CSV contains a header but no data rows');
  }

  const issues = [];
  const skus = new Map(); // skuId -> record
  const planObservations = [];
  const seenEdges = new Set();
  let duplicateEdges = 0;

  for (const { cells, values, line } of rows) {
    if (cells.length !== CSV_HEADER.length) {
      throw new CsvParseError(`CSV row ${line} has ${cells.length} cells, expected ${CSV_HEADER.length}`, {
        line,
        cells,
      });
    }

    const skuGuid = repairGuid(values.GUID);
    const planGuid = repairGuid(values.Service_Plan_Id);

    // The CSV is expected to be clean. Any repair at all is an issue, and an
    // outright invalid GUID drops the row rather than poisoning the dataset.
    if (!skuGuid.guid || !planGuid.guid) {
      issues.push({
        kind: 'invalid-guid',
        source: 'csv',
        line,
        stringId: values.String_Id,
        skuGuidRaw: values.GUID,
        planGuidRaw: values.Service_Plan_Id,
      });
      continue;
    }
    if (skuGuid.rule !== 'none' || planGuid.rule !== 'none') {
      issues.push({
        kind: 'guid-repaired',
        source: 'csv',
        line,
        rules: [skuGuid.rule, planGuid.rule].filter((rule) => rule !== 'none'),
        raw: [skuGuid.raw, planGuid.raw],
      });
    }

    const skuId = skuGuid.guid;
    const planId = planGuid.guid;
    const stringId = values.String_Id.trim();
    const productName = values.Product_Display_Name.trim();

    let sku = skus.get(skuId);
    if (!sku) {
      sku = {
        skuId,
        // Every observed spelling is counted rather than first-wins. Microsoft
        // renames products in place (Power Virtual Agents -> Copilot Studio)
        // and the old name is what people still search for, so the losing
        // variants survive as aliases instead of being discarded.
        productNames: new Map(),
        stringIds: new Map(),
        servicePlanIds: [],
        line,
        sources: ['csv'],
      };
      skus.set(skuId, sku);
    }
    if (productName) sku.productNames.set(productName, (sku.productNames.get(productName) ?? 0) + 1);
    if (stringId) sku.stringIds.set(stringId, (sku.stringIds.get(stringId) ?? 0) + 1);

    const edgeKey = `${skuId}>${planId}`;
    if (seenEdges.has(edgeKey)) {
      duplicateEdges += 1;
    } else {
      seenEdges.add(edgeKey);
      sku.servicePlanIds.push(planId);
    }

    const friendly = splitRetired(values.Service_Plans_Included_Friendly_Names);
    planObservations.push({
      planId,
      technicalName: values.Service_Plan_Name.trim() || null,
      friendlyName: friendly.name || null,
      retiredUpstream: friendly.retiredUpstream,
      skuId,
      source: 'csv',
      line,
    });
  }

  const skuList = [...skus.values()].map((sku) => ({
    ...sku,
    productNames: [...sku.productNames.entries()].map(([name, count]) => ({ name, count })),
    stringIds: [...sku.stringIds.entries()].map(([name, count]) => ({ name, count })),
  }));
  return {
    source: 'csv',
    skus: skuList,
    planObservations,
    incompatibilityGroups: [],
    document: {},
    issues,
    counts: {
      rows: rows.length,
      skus: skuList.length,
      servicePlans: new Set(planObservations.map((p) => p.planId)).size,
      edges: seenEdges.size,
      duplicateEdgeRows: duplicateEdges,
    },
  };
}
