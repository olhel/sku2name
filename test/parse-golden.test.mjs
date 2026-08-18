// Golden test.
//
// Locks the full parse+merge output for the fixture slice. Any change to the
// parser that alters a single field shows up here as a diff, which is exactly
// the review signal you want when the upstream format is hand-maintained.
//
// Regenerate deliberately, never reflexively:
//   UPDATE_GOLDEN=1 npm test
// and read the resulting diff before committing it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCsvSource } from '../src/ingest/parse-csv.mjs';
import { parseMarkdownSource } from '../src/ingest/parse-markdown.mjs';
import { mergeSources } from '../src/ingest/merge-sources.mjs';
import { stableStringify } from '../src/lib/stable-json.mjs';
import { fixture } from './helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(here, 'fixtures', 'reference-slice.golden.json');

function buildMerged() {
  return mergeSources({
    csv: parseCsvSource(fixture('reference-slice.csv')),
    markdown: parseMarkdownSource(fixture('reference-slice.md')),
  });
}

test('merged fixture output matches the golden file', () => {
  const actual = stableStringify(buildMerged());

  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN_PATH)) {
    writeFileSync(GOLDEN_PATH, actual);
    console.log(`golden file written: ${GOLDEN_PATH}`);
    return;
  }

  assert.equal(actual, readFileSync(GOLDEN_PATH, 'utf8'));
});

test('parsing the same input twice produces byte-identical output', () => {
  assert.equal(stableStringify(buildMerged()), stableStringify(buildMerged()));
});

test('the fixture exercises both sources and their disagreement', () => {
  const merged = buildMerged();
  assert.ok(merged.counts.skusFromCsvOnly > 0, 'fixture must contain a CSV-only SKU');
  assert.ok(merged.counts.edgesFromMdOnly > 0, 'fixture must contain a markdown-only edge');
  assert.deepEqual(merged.sourcesUsed, ['csv', 'md']);
});
