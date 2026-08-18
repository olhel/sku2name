#!/usr/bin/env node
// Post-build assertions. Fails the Docker build rather than shipping a broken tree.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// Compressed budgets, measured against the bytes that actually ship.
//
// The JS entries still do not meet the original plan, which set the homepage
// script at 3,600 gzip: search.js is 5,566 gzip / 4,675 brotli. It was 5,273
// before any of the search work, and no JS budget had ever been wired in, so
// the overrun went unnoticed for a long time. Like every other entry here
// these are brotli, and they sit just above today's sizes so the gap cannot
// widen silently while a decision is made about it.
const BUDGETS = {
  'assets/*.css': 4_500,
  'assets/search.*.js': 5_000,
  'assets/app.*.js': 1_300,
  'assets/filter.*.js': 1_300,
  's/idx.*.json': 32_000,
  's/guid.*.json': 28_000,
  'largest html': 22_000,
};

const errors = [];
const fail = (message) => errors.push(message);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (path) => path.slice(DIST.length + 1).replace(/\\/g, '/');

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ does not exist. Run npm run build first.');
    process.exit(1);
  }

  const files = await walk(DIST);
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const htmlPaths = new Set(htmlFiles.map(rel));

  console.log(`Verifying ${files.length} files (${htmlFiles.length} HTML)...`);

  const skus = JSON.parse(await readFile(join(ROOT, 'data/skus.json'), 'utf8'));
  const plans = JSON.parse(await readFile(join(ROOT, 'data/service-plans.json'), 'utf8'));

  // Every entity must have produced a page.
  for (const sku of skus) {
    if (!htmlPaths.has(`sku/${sku.slug}.html`)) fail(`Missing SKU page for ${sku.stringId} (${sku.slug})`);
  }
  for (const plan of plans) {
    if (!htmlPaths.has(`service-plan/${plan.slug}.html`)) {
      fail(`Missing service plan page for ${plan.technicalName} (${plan.slug})`);
    }
  }

  let largestHtml = { path: null, size: 0 };
  const guidMap = JSON.parse(await readFile(join(DIST, 'data/id-map.json'), 'utf8'));

  for (const file of htmlFiles) {
    const contents = await readFile(file, 'utf8');
    const path = rel(file);

    if (contents.length < 500) fail(`${path} is only ${contents.length} bytes`);
    // A template hole that rendered as a literal is worse than a crash,
    // because it looks fine until someone reads the page.
    if (contents.includes('undefined')) fail(`${path} contains the literal string "undefined"`);
    if (contents.includes('[object Object]')) fail(`${path} contains "[object Object]"`);
    if (!contents.includes('<link rel="canonical"')) fail(`${path} has no canonical link`);
    // style-src 'self' blocks style attributes, and the failure is silent:
    // the rule is simply dropped and the page looks subtly wrong.
    if (/<[^>]+[ ]style=/.test(contents)) fail(`${path} has an inline style attribute, which CSP blocks`);
    if (!/<title>[^<]+<\/title>/.test(contents)) fail(`${path} has no title`);
    // The row filter targets a single marked container. More than one makes
    // it filter the wrong rows and miscount; a filter box with no container
    // does nothing at all.
    const filterable = (contents.match(/data-filterable/g) || []).length;
    if (filterable > 1) {
      fail(`${path} marks ${filterable} filterable containers, expected at most 1`);
    }
    if (contents.includes('id="row-filter"') && filterable === 0) {
      fail(`${path} has a filter box but no filterable container`);
    }

    const compressed = brotliCompressSync(Buffer.from(contents)).length;
    if (compressed > largestHtml.size) largestHtml = { path, size: compressed };

    // Every internal link must resolve to something that exists.
    for (const match of contents.matchAll(/href="(\/[^"#?]*)"/g)) {
      const href = match[1];
      if (href.startsWith('/assets/') || href.startsWith('/s/') || href.startsWith('/data/')) continue;
      if (href === '/') continue;
      const candidates = [
        `${href.slice(1)}.html`,
        `${href.slice(1)}index.html`,
        `${href.slice(1)}/index.html`,
        href.slice(1),
      ];
      if (!candidates.some((candidate) => htmlPaths.has(candidate) || existsSync(join(DIST, candidate)))) {
        fail(`${path} links to ${href}, which does not exist`);
      }
    }
  }

  // The id map must not point anywhere that does not exist.
  for (const [guid, target] of Object.entries(guidMap.guid)) {
    if (!htmlPaths.has(`${target.slice(1)}.html`)) fail(`id-map entry ${guid} points at missing ${target}`);
  }

  // The desktop nav lives inside a <details> that is only a disclosure below
  // 40rem. Engines hide a closed <details> two different ways: older ones put
  // display:none on the content, which .site-nav's own display:flex overrides,
  // and newer ones hide ::details-content, which no rule on the child can
  // reach. Both overrides have to be present or the entire desktop navigation
  // silently disappears on one engine while looking fine on the other.
  {
    const cssFile = (await readdir(join(DIST, 'assets'))).find((n) => n.endsWith('.css'));
    const css = await readFile(join(DIST, 'assets', cssFile), 'utf8');
    if (!css.includes('.nav-disclosure::details-content')) {
      fail('base.css has no ::details-content override; the desktop nav vanishes on current Chrome and Edge');
    }
    // A plain substring, not a regex: the brackets in :not([open]) read as a
    // character class and the pattern silently never matches.
    if (!css.includes('.nav-disclosure:not([open]) .site-nav')) {
      fail('base.css never states the closed nav state; the mobile menu stays open on older engines');
    }
  }

  // MIT compliance: the upstream notice must ship with the data.
  const noticePath = join(DIST, 'data/NOTICE.txt');
  if (!existsSync(noticePath)) {
    fail('data/NOTICE.txt is missing; MIT requires the upstream notice to ship with the dataset');
  } else {
    const notice = await readFile(noticePath, 'utf8');
    for (const required of ['Copyright (c) Microsoft Corporation', 'shall be included in all']) {
      if (!notice.includes(required)) fail(`data/NOTICE.txt is missing the text "${required}"`);
    }
  }

  // Sitemap coverage must match the pages actually emitted.
  const locsIn = async (name) => {
    const xml = await readFile(join(DIST, name), 'utf8');
    return xml.split('<loc>').slice(1).map((part) => part.split('<')[0]);
  };
  const staticUrls = await locsIn('sitemap-pages.xml');
  const skuUrls = await locsIn('sitemap-skus.xml');
  const planUrls = await locsIn('sitemap-plans.xml');

  // Derived rather than hard-coded: adding or removing a static page should
  // not require editing a magic number here.
  if (skuUrls.length !== skus.length) {
    fail(`sitemap-skus lists ${skuUrls.length} URLs, expected ${skus.length}`);
  }
  if (planUrls.length !== plans.length) {
    fail(`sitemap-plans lists ${planUrls.length} URLs, expected ${plans.length}`);
  }
  if (staticUrls.length < 4) {
    fail(`sitemap-pages lists only ${staticUrls.length} URLs`);
  }
  for (const url of [...staticUrls, ...skuUrls, ...planUrls]) {
    if (!url.startsWith('https://')) fail(`sitemap entry is not absolute: ${url}`);
  }

  // Byte budgets against the compressed bytes that actually ship.
  for (const file of files) {
    const path = rel(file);
    const budget =
      path.endsWith('.css') ? BUDGETS['assets/*.css']
      : path.startsWith('assets/search.') ? BUDGETS['assets/search.*.js']
      : path.startsWith('assets/app.') ? BUDGETS['assets/app.*.js']
      : path.startsWith('assets/filter.') ? BUDGETS['assets/filter.*.js']
      : /^s\/idx\./.test(path) ? BUDGETS['s/idx.*.json']
      : /^s\/guid\./.test(path) ? BUDGETS['s/guid.*.json']
      : null;
    if (!budget) continue;
    const size = brotliCompressSync(await readFile(file)).length;
    if (size > budget) fail(`${path} is ${size} bytes compressed, over its ${budget} budget`);
  }

  if (largestHtml.size > BUDGETS['largest html']) {
    fail(`Largest page ${largestHtml.path} is ${largestHtml.size} bytes compressed, over ${BUDGETS['largest html']}`);
  }

  if (errors.length > 0) {
    console.error(`\nVERIFY FAILED with ${errors.length} problem(s):`);
    errors.slice(0, 40).forEach((message, index) => console.error(`  ${index + 1}. ${message}`));
    if (errors.length > 40) console.error(`  ... and ${errors.length - 40} more`);
    process.exit(1);
  }

  console.log(`OK. Largest page ${largestHtml.path} at ${largestHtml.size} bytes compressed.`);
}

main().catch((error) => {
  console.error(`VERIFY CRASHED: ${error.message}`);
  process.exit(1);
});
