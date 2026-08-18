import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownSource, MarkdownParseError } from '../src/ingest/parse-markdown.mjs';
import {
  splitFrontMatter,
  readMsDate,
  readLastUpdatedNote,
  locateMainTable,
  locateIncompatibilitySections,
  MainTableNotFoundError,
} from '../src/ingest/sections.mjs';
import { fixture } from './helpers.mjs';

const slice = () => parseMarkdownSource(fixture('reference-slice.md'));
const sliceLines = () => splitFrontMatter(fixture('reference-slice.md')).body.split('\n');

const MAIN_HEADER =
  '| Product name | String ID | GUID | Service plans included | Service plans included (friendly names) |';
const DELIMITER = '| --- | --- | --- | --- | --- |';

test('splits YAML frontmatter from the body', () => {
  const { frontMatter, body } = splitFrontMatter(fixture('reference-slice.md'));
  assert.ok(frontMatter.includes('ms.date'));
  assert.ok(!body.includes('ms.date'));
  assert.ok(body.startsWith('\n# Product names'));
});

test('reads ms.date in both slash and ISO forms', () => {
  assert.equal(readMsDate('ms.date: 07/01/2026'), '2026-07-01');
  assert.equal(readMsDate('ms.date: 2026-08-14'), '2026-08-14');
  assert.equal(readMsDate('ms.date: 7/1/2026'), '2026-07-01');
  assert.equal(readMsDate('other: value'), null);
});

test('reads the human last-updated note without Date parsing', () => {
  const note = readLastUpdatedNote('This information was last updated on August 14, 2026.');
  assert.deepEqual(note, { iso: '2026-08-14', raw: 'August 14, 2026' });
  assert.equal(readLastUpdatedNote('no note here'), null);
});

test('selects the main table by header signature', () => {
  const table = locateMainTable(sliceLines());
  assert.equal(table.headerCells.length, 5);
  assert.ok(table.rows.length > 10);
});

test('ignores the two-column incompatibility tables entirely', () => {
  const table = locateMainTable(sliceLines());
  assert.ok(table.rows.every((row) => row.cells.length === 5));
});

test('stops before the section boundary, so a later look-alike table is not picked up', () => {
  // The fixture deliberately places a second five-column table after
  // "## Next steps". Selecting it would be a silent data corruption.
  const stringIds = slice().skus.flatMap((sku) => sku.stringIds.map((n) => n.name));
  assert.ok(!stringIds.includes('DECOY'), 'the table after Next steps must not be parsed');
});

test('throws when the header signature is absent', () => {
  assert.throws(() => locateMainTable(['| a | b |', '| --- | --- |', '| 1 | 2 |']), MainTableNotFoundError);
});

test('throws when two tables match the main-table signature', () => {
  const lines = [MAIN_HEADER, DELIMITER, '| a | b | c | d | e |', '', MAIN_HEADER, DELIMITER, '| f | g | h | i | j |'];
  assert.throws(() => locateMainTable(lines), /found 2/);
});

test('captures the service name from a Service: *X* heading', () => {
  const sections = locateIncompatibilitySections(sliceLines());
  assert.deepEqual(sections.map((s) => s.service), ['Exchange Online', 'Microsoft Entra ID']);
});

test('parses incompatibility group members', () => {
  const groups = slice().incompatibilityGroups;
  assert.equal(groups.length, 2);
  assert.equal(groups[0].members.length, 2);
  assert.equal(groups[0].members[0].planId, '9aaf7827-d63c-4b61-89c3-182f06f82e5c');
});

test('a row with the wrong cell count is an error, not a silent skip', () => {
  const lines = [MAIN_HEADER, DELIMITER, '| only | three | cells |'].join('\n');
  assert.throws(() => parseMarkdownSource(lines), MarkdownParseError);
});

test('reads document dates from the fixture', () => {
  assert.deepEqual(slice().document, {
    msDate: '2026-07-01',
    lastUpdated: '2026-08-14',
    lastUpdatedRaw: 'August 14, 2026',
  });
});

test('records every known quirk shape exactly once', () => {
  const counts = {};
  for (const quirk of slice().quirks) counts[quirk.kind] = (counts[quirk.kind] || 0) + 1;
  assert.deepEqual(counts, {
    'guid-repair': 2,
    'name-repair': 1,
    'unclosed-paren': 1,
    'guid-not-last': 1,
  });
});

test('both MCOPSTN5 rows are kept as separate SKUs with distinct GUIDs', () => {
  const mcopstn5 = slice().skus.filter((sku) => sku.stringIds.some((n) => n.name === 'MCOPSTN5'));
  assert.equal(mcopstn5.length, 2);
  assert.notEqual(mcopstn5[0].skuId, mcopstn5[1].skuId);
});

test('a URL-hostile String ID is preserved verbatim in the data', () => {
  const sku = slice().skus.find((s) => s.stringIds.some((n) => n.name === 'O365_w/o Teams Bundle_M3'));
  assert.ok(sku, 'the slash-containing String ID must survive parsing unchanged');
});

test('parsing is deterministic', () => {
  assert.equal(JSON.stringify(slice()), JSON.stringify(slice()));
});
