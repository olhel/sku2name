#!/usr/bin/env node
// data/ -> dist/
//
// Always a full rebuild. Roughly 1,400 small files write in a couple of
// seconds and this runs at image build time, not per request, so an
// incremental cache would buy seconds while adding a real correctness risk:
// adding one SKU changes the reverse-index fan-out on up to a hundred plan
// pages.
//
// Determinism is a hard requirement. No Date.now(), no new Date(), no Intl,
// no localeCompare anywhere in a render path. Two builds of the same data must
// be byte-identical, which is asserted by the test suite.

import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReverseIndex } from '../src/ingest/normalize.mjs';
import { categoryTable, CATEGORY_RULES } from '../src/ingest/derive-categories.mjs';
import { renderTokensCss } from '../src/render/tokens.mjs';
import { shortHash } from '../src/lib/hash.mjs';
import { byCodeUnit } from '../src/lib/sort.mjs';
import { stableStringify, compactStringify } from '../src/lib/stable-json.mjs';
import { renderSkuPage, skuPath } from '../src/render/page-sku.mjs';
import { renderPlanPage, planPath, planHeading } from '../src/render/page-plan.mjs';
import { renderHomePage } from '../src/render/page-home.mjs';
import {
  renderBrowsePage,
  renderBrowseHubPage,
  renderDisambiguationPage,
  renderAboutPage,
  renderDataPage,
  render404Page,
  renderIdNotFoundPage,
} from '../src/render/page-static.mjs';
import { buildSearchIndexes } from '../src/render/search-index.mjs';
import { renderSitemaps } from '../src/render/sitemap.mjs';
import { renderRobots, renderLlmsTxt } from '../src/render/robots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_RULES.map((rule) => [rule.id, rule.label]));

// Hand-curated, and the only curated list in the project. These are the
// licenses people actually look up, surfaced on the homepage as real links so
// they are also crawl paths.
const POPULAR_STRING_IDS = [
  'ENTERPRISEPACK', 'ENTERPRISEPREMIUM', 'SPE_E3', 'SPE_E5', 'O365_BUSINESS_PREMIUM',
  'SPB', 'DESKLESSPACK', 'SPE_F1', 'STANDARDPACK', 'EXCHANGESTANDARD',
  'POWER_BI_PRO', 'AAD_PREMIUM', 'AAD_PREMIUM_P2', 'EMS', 'INTUNE_A',
];

async function emit(relativePath, contents) {
  const target = join(DIST, relativePath);
  await mkdir(dirname(target), { recursive: true });
  // Write an explicit UTF-8 buffer so Windows never injects CRLF.
  await writeFile(target, Buffer.from(contents, 'utf8'));
}

async function copyDir(from, to) {
  if (!existsSync(from)) return;
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) await copyDir(source, target);
    else await copyFile(source, target);
  }
}

/**
 * Content-hashed asset names, so the manual ?v= cache-busting the sibling
 * project maintains by hand cannot be forgotten on one of 1,400 pages.
 */
async function buildAssets() {
  const css = renderTokensCss() + '\n' + (await readFile(join(ROOT, 'src/styles/base.css'), 'utf8'));
  const manifest = {};

  const cssName = `styles.${shortHash(css)}.css`;
  await emit(`assets/${cssName}`, css);
  manifest.css = `/assets/${cssName}`;

  for (const [key, file] of [['app', 'app.js'], ['search', 'search.js'], ['filter', 'filter.js']]) {
    const source = await readFile(join(ROOT, 'src/client', file), 'utf8');
    const name = `${file.replace('.js', '')}.${shortHash(source)}.js`;
    await emit(`assets/${name}`, source);
    manifest[key] = `/assets/${name}`;
  }

  return manifest;
}

/** Top 5 SKUs by Jaccard similarity of their service plan sets. */
function findSimilar(sku, skus, planSets, limit = 5) {
  const own = planSets.get(sku.skuId);
  if (!own || own.size === 0) return [];

  const scored = [];
  for (const other of skus) {
    if (other.skuId === sku.skuId) continue;
    const theirs = planSets.get(other.skuId);
    if (!theirs || theirs.size === 0) continue;

    let shared = 0;
    const [small, large] = own.size <= theirs.size ? [own, theirs] : [theirs, own];
    for (const planId of small) if (large.has(planId)) shared += 1;
    if (shared === 0) continue;

    const union = own.size + theirs.size - shared;
    scored.push({
      skuId: other.skuId,
      slug: other.slug,
      productName: other.productName,
      stringId: other.stringId,
      shared,
      total: own.size,
      score: shared / union,
    });
  }

  scored.sort(
    (a, b) => b.score - a.score || b.shared - a.shared || byCodeUnit(a.productName, b.productName)
  );
  return scored.slice(0, limit);
}

async function main() {
  const started = Date.now();

  const [skus, servicePlans, incompatibilityGroups, meta, slugRegistry] = await Promise.all([
    readFile(join(DATA, 'skus.json'), 'utf8').then(JSON.parse),
    readFile(join(DATA, 'service-plans.json'), 'utf8').then(JSON.parse),
    readFile(join(DATA, 'incompatibility-groups.json'), 'utf8').then(JSON.parse),
    readFile(join(DATA, 'source-meta.json'), 'utf8').then(JSON.parse),
    readFile(join(DATA, 'slug-registry.json'), 'utf8').then(JSON.parse),
  ]);

  await rm(DIST, { recursive: true, force: true });
  await copyDir(join(ROOT, 'public'), DIST);

  const assets = await buildAssets();

  const planById = new Map(servicePlans.map((plan) => [plan.planId, plan]));
  const skuById = new Map(skus.map((sku) => [sku.skuId, sku]));
  const reverse = buildReverseIndex(skus);
  const planSets = new Map(skus.map((sku) => [sku.skuId, new Set(sku.servicePlanIds)]));
  const counts = meta.counts;

  // Conflicts keyed by plan, so a plan page can show what it clashes with.
  const conflictsByPlan = new Map();
  for (const group of incompatibilityGroups) {
    for (const member of group.members) {
      const others = group.members.filter((other) => other.planId !== member.planId);
      if (others.length === 0) continue;
      conflictsByPlan.set(member.planId, {
        service: group.service,
        members: others.map((other) => ({
          name: other.name,
          slug: planById.get(other.planId)?.slug || null,
        })),
      });
    }
  }

  const pages = [];

  // --- SKU pages ---------------------------------------------------------
  for (const sku of skus) {
    const plans = sku.servicePlanIds
      .map((planId) => planById.get(planId))
      .filter(Boolean)
      .map((plan) => ({ ...plan, skuCount: (reverse.get(plan.planId) || []).length }))
      .sort((a, b) => byCodeUnit(a.friendlyName || a.technicalName, b.friendlyName || b.technicalName));

    const html = renderSkuPage({
      sku,
      plans,
      similar: findSimilar(sku, skus, planSets),
      meta,
      assets,
      categoryLabels: CATEGORY_LABELS,
    });
    const path = skuPath(sku);
    await emit(`${path.slice(1)}.html`, html);
    pages.push({ path, html });
  }

  // --- service plan pages ------------------------------------------------
  for (const plan of servicePlans) {
    const owning = (reverse.get(plan.planId) || [])
      .map((skuId) => skuById.get(skuId))
      .filter(Boolean)
      .map((sku) => ({ ...sku, planCount: sku.servicePlanIds.length }))
      .sort((a, b) => byCodeUnit(a.productName, b.productName));

    const html = renderPlanPage({
      plan,
      skus: owning,
      conflicts: conflictsByPlan.get(plan.planId) || null,
      meta,
      assets,
    });
    const path = planPath(plan);
    await emit(`${path.slice(1)}.html`, html);
    pages.push({ path, html });
  }

  // --- disambiguation pages ----------------------------------------------
  for (const [kind, entries] of Object.entries(slugRegistry.disambiguation || {})) {
    for (const [slug, guids] of Object.entries(entries)) {
      const isSku = kind === 'sku';
      const rows = guids
        .map((guid) => {
          const record = isSku ? skuById.get(guid) : planById.get(guid);
          if (!record) return null;
          return {
            guid,
            href: isSku ? skuPath(record) : planPath(record),
            name: isSku ? record.productName : planHeading(record),
            technical: isSku ? record.stringId : record.technicalName,
          };
        })
        .filter(Boolean);
      if (rows.length < 2) continue;

      const html = renderDisambiguationPage({ slug, kind, entries: rows, meta, assets });
      const path = `/${isSku ? 'sku' : 'service-plan'}/${slug}`;
      await emit(`${path.slice(1)}.html`, html);
      pages.push({ path, html });
    }
  }

  // --- browse ------------------------------------------------------------
  const skuItems = skus
    .map((sku) => ({
      href: skuPath(sku),
      name: sku.productName,
      technical: sku.stringId,
    }))
    .sort((a, b) => byCodeUnit(a.name, b.name));

  const planItems = servicePlans
    .map((plan) => ({
      href: planPath(plan),
      name: planHeading(plan),
      technical: plan.technicalName,
    }))
    .sort((a, b) => byCodeUnit(a.name, b.name));

  await emitPage('/browse/', renderBrowseHubPage({ meta, assets, counts }), pages);
  await emitPage('/browse/skus/', renderBrowsePage({ kind: 'sku', items: skuItems, meta, assets, counts }), pages);
  await emitPage('/browse/service-plans/', renderBrowsePage({ kind: 'plan', items: planItems, meta, assets, counts }), pages);

  // --- search indexes ----------------------------------------------------
  const indexes = buildSearchIndexes({ skus, servicePlans, reverse });
  const idxName = `idx.${shortHash(indexes.main)}.json`;
  const guidName = `guid.${shortHash(indexes.guid)}.json`;
  await emit(`s/${idxName}`, indexes.main);
  await emit(`s/${guidName}`, indexes.guid);
  const searchMeta = `<meta name="search-index" content="/s/${idxName}" />\n<meta name="guid-index" content="/s/${guidName}" />\n<link rel="preload" as="fetch" href="/s/${idxName}" crossorigin="anonymous" />`;

  // --- home and static pages ---------------------------------------------
  const popular = POPULAR_STRING_IDS.map((stringId) => skus.find((sku) => sku.stringId === stringId)).filter(Boolean);

  const home = renderHomePage({ meta, assets, counts, popular, searchIndexPath: `/s/${idxName}` }).replace(
    '</head>',
    `${searchMeta}\n</head>`
  );
  await emitPage('/', home, pages, 'index.html');
  await emitPage('/about/', renderAboutPage({ meta, assets, counts }), pages);
  await emitPage('/data/', renderDataPage({ meta, assets, counts, categories: categoryTable() }), pages);

  // 404 and the GUID-miss template are served by Express, never crawled.
  await emit('404.html', render404Page({ meta, assets, counts }).replace('</head>', `${searchMeta}\n</head>`));
  await emit('id-not-found.html', renderIdNotFoundPage({ meta, assets }));

  // --- machine-readable ---------------------------------------------------
  await emit('data/skus.json', stableStringify(skus));
  await emit('data/service-plans.json', stableStringify(servicePlans));
  await emit('data/source-meta.json', stableStringify(meta));
  await emit('data/id-map.json', compactStringify(buildIdMap({ skus, servicePlans })));

  const canonicalPaths = pages.map((page) => page.path);
  for (const [name, xml] of Object.entries(renderSitemaps({ skus, servicePlans, meta, extraPaths: ['/', '/browse/', '/browse/skus/', '/browse/service-plans/', '/about/', '/data/'] }))) {
    await emit(name, xml);
  }
  await emit('robots.txt', renderRobots());
  await emit('llms.txt', renderLlmsTxt({ counts, meta }));

  console.log(
    `Built ${pages.length} pages in ${Date.now() - started} ms ` +
      `(${skus.length} SKUs, ${servicePlans.length} plans, ${canonicalPaths.length} canonical URLs)`
  );
}

async function emitPage(path, html, pages, filename = null) {
  const relative = filename ? join(path.slice(1), filename) : `${path.slice(1)}index.html`;
  await emit(relative, html);
  pages.push({ path, html });
}

/**
 * guid -> canonical path, consumed by the Express /id/:guid route.
 * Aliases and String IDs resolve too, so /id/EXCHANGE_S_ENTERPRISE works.
 */
function buildIdMap({ skus, servicePlans }) {
  const guid = {};
  const alias = {};
  const key = (value) => String(value).toLowerCase().replace(/[\s_-]+/g, '');

  for (const sku of skus) {
    const path = skuPath(sku);
    guid[sku.skuId] = path;
    if (sku.stringId) alias[key(sku.stringId)] = path;
    for (const name of sku.aliases?.stringId || []) alias[key(name)] = path;
  }
  for (const plan of servicePlans) {
    const path = planPath(plan);
    guid[plan.planId] = path;
    if (plan.technicalName) alias[key(plan.technicalName)] = path;
    for (const name of plan.aliases?.technical || []) alias[key(name)] = path;
  }
  return { guid, alias };
}

main().catch((error) => {
  console.error(`BUILD FAILED: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
