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
const BUDGETS = {
  'assets/*.css': 4_500,
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
  const sitemapUrls = new Set();
  for (const name of ['sitemap-pages.xml', 'sitemap-skus.xml', 'sitemap-plans.xml']) {
    const xml = await readFile(join(DIST, name), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.add(match[1]);
  }
  if (sitemapUrls.size !== skus.length + plans.length + 6) {
    fail(`Sitemap lists ${sitemapUrls.size} URLs, expected ${skus.length + plans.length + 6}`);
  }

  // Byte budgets against the compressed bytes that actually ship.
  for (const file of files) {
    const path = rel(file);
    const budget =
      path.endsWith('.css') ? BUDGETS['assets/*.css']
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
