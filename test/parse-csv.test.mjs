import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvSource, splitRetired, CsvParseError } from '../src/ingest/parse-csv.mjs';
import { fixture } from './helpers.mjs';

const slice = () => parseCsvSource(fixture('reference-slice.csv'));

test('parses the slice into SKUs, plans and edges', () => {
  const ds = slice();
  assert.equal(ds.source, 'csv');
  assert.equal(ds.counts.skus, 5);
  assert.equal(ds.counts.edges, 8);
});

test('deduplicates a repeated SKU/plan row', () => {
  const ds = slice();
  assert.equal(ds.counts.duplicateEdgeRows, 1);
  const e3 = ds.skus.find((s) => s.stringIds[0].name === 'ENTERPRISEPACK');
  const foundation = e3.servicePlanIds.filter((id) => id === '113feb6c-3fe4-4440-bddc-54d774bf0318');
  assert.equal(foundation.length, 1, 'the duplicated edge must appear once');
});

test('preserves document order of service plans within a SKU', () => {
  const e3 = slice().skus.find((s) => s.stringIds[0].name === 'ENTERPRISEPACK');
  assert.deepEqual(e3.servicePlanIds, [
    'efb87545-963c-4e0d-99df-69c6916d9eb0',
    '113feb6c-3fe4-4440-bddc-54d774bf0318',
  ]);
});

test('lifts a RETIRED prefix into a flag instead of leaving it in the name', () => {
  const ds = slice();
  const retired = ds.planObservations.filter((p) => p.retiredUpstream);
  assert.equal(retired.length, 1);
  assert.equal(retired[0].friendlyName, 'Field Service Automated Routing Engine Add-On');
  assert.ok(!retired[0].friendlyName.includes('RETIRED'));
});

test('splitRetired handles the separator variants and leaves other names alone', () => {
  assert.deepEqual(splitRetired('RETIRED - Thing'), { name: 'Thing', retiredUpstream: true });
  assert.deepEqual(splitRetired('RETIRED – Thing'), { name: 'Thing', retiredUpstream: true });
  assert.deepEqual(splitRetired('Retired Users Plan'), { name: 'Retired Users Plan', retiredUpstream: false });
});

test('keeps every observed product name with a count, so renames survive as aliases', () => {
  const renamed = slice().skus.find((s) => s.stringIds[0].name === 'POWER_VIRTUAL_AGENTS');
  const names = renamed.productNames.map((n) => n.name).sort();
  assert.deepEqual(names, ['Microsoft Copilot Studio User License', 'Power Virtual Agent User License']);
});

test('handles a quoted field containing a comma', () => {
  const ds = slice();
  const names = ds.skus.flatMap((s) => s.productNames.map((n) => n.name));
  assert.ok(names.includes('Dynamics 365 Field Service, Enterprise Edition'));
});

test('handles an escaped double quote in a product name', () => {
  const names = slice().skus.flatMap((s) => s.productNames.map((n) => n.name));
  assert.ok(names.includes('Teams "Premium" Trial'));
});

test('rejects a changed header rather than parsing it', () => {
  assert.throws(() => parseCsvSource(fixture('quirks', 'csv-wrong-header.csv')), CsvParseError);
});

test('rejects a header with no data rows', () => {
  assert.throws(
    () => parseCsvSource('Product_Display_Name,String_Id,GUID,Service_Plan_Name,Service_Plan_Id,Service_Plans_Included_Friendly_Names\n'),
    CsvParseError
  );
});

test('drops a row with an invalid GUID and reports it rather than poisoning the dataset', () => {
  const ds = parseCsvSource(fixture('quirks', 'csv-bad-guid.csv'));
  assert.equal(ds.counts.skus, 1);
  assert.equal(ds.issues.length, 1);
  assert.equal(ds.issues[0].kind, 'invalid-guid');
  assert.equal(ds.issues[0].line, 2);
});

test('the real CSV needs no GUID repair at all', () => {
  const ds = slice();
  assert.equal(ds.issues.filter((i) => i.kind === 'guid-repaired').length, 0);
});

test('parsing is deterministic', () => {
  const a = JSON.stringify(slice());
  const b = JSON.stringify(slice());
  assert.equal(a, b);
});
