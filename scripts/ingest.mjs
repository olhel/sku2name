#!/usr/bin/env node
// Fetch, parse, merge, validate, write.
//
// Runs on a schedule in CI, never at request time. The whole dataset is built
// in memory and validated before a single file is written, so a gate failure
// can never leave a half-written dataset behind.
//
// Usage:
//   node scripts/ingest.mjs                     fetch from upstream
//   node scripts/ingest.mjs --local             use tmp/source.{csv,md}
//   node scripts/ingest.mjs --allow-large-change
//   node scripts/ingest.mjs --dry-run           validate but write nothing

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOURCES, fetchSource, fetchCommitInfo } from '../src/ingest/fetch-source.mjs';
import { parseCsvSource } from '../src/ingest/parse-csv.mjs';
import { parseMarkdownSource } from '../src/ingest/parse-markdown.mjs';
import { mergeSources } from '../src/ingest/merge-sources.mjs';
import { normalizeDataset } from '../src/ingest/normalize.mjs';
import { validate, formatReport } from '../src/ingest/validate.mjs';
import { emptyRegistry } from '../src/ingest/slug-registry.mjs';
import { stableStringify } from '../src/lib/stable-json.mjs';
import { renderNoticeText } from '../src/render/attribution.mjs';
import { formatDate } from '../src/render/layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const TMP_DIR = join(ROOT, 'tmp');

const args = new Set(process.argv.slice(2));
const useLocal = args.has('--local');
const dryRun = args.has('--dry-run');
const allowLargeChange = args.has('--allow-large-change');

async function readJsonIfPresent(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadSources() {
  if (useLocal) {
    console.log('Reading local sources from tmp/');
    const [csv, markdown] = await Promise.all([
      readFile(join(TMP_DIR, 'source.csv'), 'utf8'),
      readFile(join(TMP_DIR, 'source.md'), 'utf8'),
    ]);
    return {
      csv: { text: csv, bytes: Buffer.byteLength(csv), etag: null, contentHash: null, normalisedHash: null },
      markdown: { text: markdown, bytes: Buffer.byteLength(markdown), etag: null, contentHash: null, normalisedHash: null },
      commit: null,
    };
  }

  console.log('Fetching upstream sources...');
  // A CSV failure is survivable: the run continues markdown-only with a loud
  // warning, because a CDN blob with no version history is exactly the kind of
  // dependency that vanishes without notice. A markdown failure is likewise
  // survivable. Losing BOTH is what the gate turns into an error.
  const [csv, markdown, commit] = await Promise.all([
    fetchSource(SOURCES.csv).catch((error) => {
      console.warn(`WARNING: CSV source unavailable: ${error.message}`);
      return null;
    }),
    fetchSource(SOURCES.markdown).catch((error) => {
      console.warn(`WARNING: markdown source unavailable: ${error.message}`);
      return null;
    }),
    fetchCommitInfo(SOURCES.markdown, { token: process.env.GITHUB_TOKEN }),
  ]);
  return { csv, markdown, commit };
}

async function main() {
  const started = new Date().toISOString();
  const { csv: csvFetch, markdown: markdownFetch, commit } = await loadSources();

  if (!csvFetch && !markdownFetch) {
    console.error('FATAL: neither source could be fetched. Nothing was written.');
    process.exit(1);
  }

  const csv = csvFetch ? parseCsvSource(csvFetch.text) : null;
  const markdown = markdownFetch ? parseMarkdownSource(markdownFetch.text) : null;

  if (csv) console.log(`  csv      ${csv.counts.skus} SKUs, ${csv.counts.servicePlans} plans, ${csv.counts.edges} edges`);
  if (markdown) {
    console.log(`  markdown ${markdown.counts.skus} SKUs, ${markdown.counts.servicePlans} plans, ${markdown.counts.edges} edges`);
  }

  const merged = mergeSources({ csv, markdown });

  const previousRegistry = await readJsonIfPresent(join(DATA_DIR, 'slug-registry.json'), emptyRegistry());
  const previous = existsSync(join(DATA_DIR, 'skus.json'))
    ? {
        skus: await readJsonIfPresent(join(DATA_DIR, 'skus.json'), []),
        servicePlans: await readJsonIfPresent(join(DATA_DIR, 'service-plans.json'), []),
        counts: (await readJsonIfPresent(join(DATA_DIR, 'source-meta.json'), {})).counts,
      }
    : null;

  const dataset = normalizeDataset(merged, {
    registry: previousRegistry,
    firstSeen: started.slice(0, 10),
  });

  console.log(`  merged   ${dataset.counts.skus} SKUs, ${dataset.counts.servicePlans} plans, ${dataset.counts.edges} edges`);

  const allowlist = JSON.parse(await readFile(join(ROOT, 'src/ingest/quirks-allowlist.json'), 'utf8'));
  const result = validate({
    dataset,
    merged,
    previous,
    allowlist,
    previousRegistry,
    options: { allowLargeChange },
  });

  console.log(formatReport(result));

  if (!result.ok) {
    await mkdir(TMP_DIR, { recursive: true });
    await writeFile(join(TMP_DIR, 'ingest-report.json'), stableStringify(result));
    console.error('\nValidation failed. Previous dataset left untouched. Report: tmp/ingest-report.json');
    process.exit(1);
  }

  // Determinism self-check: catches an accidental Date.now() or an unsorted
  // iteration the moment it is introduced.
  const second = normalizeDataset(merged, { registry: previousRegistry, firstSeen: started.slice(0, 10) });
  if (second.datasetHash !== dataset.datasetHash) {
    console.error('FATAL: normalization is not deterministic. Two runs produced different hashes.');
    process.exit(1);
  }

  const sourceMeta = {
    schemaVersion: 1,
    sources: {
      csv: describeSource(SOURCES.csv, csvFetch, Boolean(csv)),
      markdown: {
        ...describeSource(SOURCES.markdown, markdownFetch, Boolean(markdown)),
        repo: SOURCES.markdown.repo,
        path: SOURCES.markdown.path,
        commitSha: commit?.sha || null,
        commitDate: commit?.date || null,
        commitShaSource: commit?.source || 'unavailable',
      },
    },
    document: merged.document,
    fetchedAt: started,
    datasetHash: dataset.datasetHash,
    counts: dataset.counts,
    quality: {
      warnings: result.warnings.length,
      quirks: (merged.quirks || []).length,
      issues: (merged.issues || []).length,
    },
  };

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeAtomic(join(DATA_DIR, 'skus.json'), stableStringify(dataset.skus));
  await writeAtomic(join(DATA_DIR, 'service-plans.json'), stableStringify(dataset.servicePlans));
  await writeAtomic(join(DATA_DIR, 'incompatibility-groups.json'), stableStringify(dataset.incompatibilityGroups));
  await writeAtomic(join(DATA_DIR, 'slug-registry.json'), stableStringify(dataset.slugRegistry));
  await writeAtomic(join(DATA_DIR, 'source-meta.json'), stableStringify(sourceMeta));

  // MIT requires the upstream notice to travel with substantial portions of
  // the work. Regenerated here so its sync date always matches the dataset.
  await writeAtomic(
    join(ROOT, 'NOTICE'),
    renderNoticeText({ syncedLabel: formatDate(merged.document?.lastUpdated) })
  );

  console.log(`\nWrote data/ at ${dataset.datasetHash}`);
}

function describeSource(source, fetched, parsed) {
  return {
    url: source.url,
    available: Boolean(fetched),
    parsed,
    bytes: fetched?.bytes ?? null,
    etag: fetched?.etag ?? null,
    lastModified: fetched?.lastModified ?? null,
    contentHash: fetched?.contentHash ?? null,
    normalisedHash: fetched?.normalisedHash ?? null,
  };
}

async function writeAtomic(path, contents) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, path);
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
