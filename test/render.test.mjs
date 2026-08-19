import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esc, html, raw, jsonLd } from '../src/lib/html.mjs';
import { buildTitle, trimDescription, formatDate, formatNumber } from '../src/render/layout.mjs';
import { renderSkuPage, skuTitle, skuDescription } from '../src/render/page-sku.mjs';
import { renderPlanPage, planTitle, planHeading, planDescription } from '../src/render/page-plan.mjs';
import { renderTokensCss, LIGHT, DARK } from '../src/render/tokens.mjs';
import { buildSearchIndexes } from '../src/render/search-index.mjs';

const assets = { css: '/assets/s.css', app: '/assets/a.js', search: '/assets/q.js', filter: '/assets/f.js' };
const meta = { document: { lastUpdated: '2026-08-14' } };

const sku = {
  skuId: '6fd2c87f-b296-42f0-b197-1e91e994b900',
  stringId: 'ENTERPRISEPACK',
  productName: 'Office 365 E3',
  slug: 'enterprisepack',
  servicePlanIds: ['efb87545-963c-4e0d-99df-69c6916d9eb0'],
  aliases: { stringId: [], productName: [] },
  sources: ['csv', 'md'],
};

const plan = {
  planId: 'efb87545-963c-4e0d-99df-69c6916d9eb0',
  technicalName: 'EXCHANGE_S_ENTERPRISE',
  friendlyName: 'Exchange Online (Plan 2)',
  slug: 'exchange_s_enterprise',
  aliases: { technical: [], friendly: [] },
  retiredUpstream: false,
  sources: ['csv', 'md'],
};

/* ---------- escaping ---------- */

test('escapes the characters that could break out of markup', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(esc("it's"), 'it&#39;s');
});

test('the html template escapes interpolations by default', () => {
  const output = String(html`<p>${'<img onerror=alert(1)>'}</p>`);
  assert.ok(!output.includes('<img'));
  assert.ok(output.includes('&lt;img'));
});

test('raw() opts out of escaping so components can compose', () => {
  assert.equal(String(html`<p>${raw('<b>bold</b>')}</p>`), '<p><b>bold</b></p>');
});

test('arrays interpolate without commas between items', () => {
  assert.equal(String(html`${['a', 'b', 'c']}`), 'abc');
});

test('null, undefined and false render as nothing', () => {
  assert.equal(String(html`[${null}${undefined}${false}]`), '[]');
});

test('JSON-LD escapes a closing script tag', () => {
  const output = String(jsonLd({ name: '</script><img onerror=alert(1)>' }));
  assert.ok(!output.includes('</script><img'));
  assert.ok(output.includes('\\u003c'));
});

// Product names really do contain these characters.
test('renders a product name containing an ampersand and a slash safely', () => {
  const tricky = { ...sku, productName: 'Enterprise & Mobility w/o Teams', stringId: 'O365_w/o Teams Bundle_M3' };
  const output = renderSkuPage({ sku: tricky, plans: [], similar: { items: [], editionsOfThis: 0 }, meta, assets });
  assert.ok(output.includes('Enterprise &amp; Mobility w/o Teams'));
  assert.ok(!output.includes('Enterprise & Mobility'));
});

/* ---------- titles and descriptions ---------- */

test('title keeps the name and drops the brand when it would overflow', () => {
  const short = buildTitle('Office 365 E3 (ENTERPRISEPACK)');
  assert.ok(short.endsWith('· sku2name'));
  assert.ok(short.length <= 60);

  const long = buildTitle('A'.repeat(58));
  assert.ok(!long.includes('sku2name'), 'brand is dropped before the name is touched');
  assert.ok(long.length <= 60);
});

test('descriptions trim at a sentence boundary rather than mid-word', () => {
  const trimmed = trimDescription('First sentence here. Second sentence that pushes it well past the limit and keeps going for a while longer.', 40);
  assert.ok(trimmed.length <= 41);
  assert.ok(!trimmed.endsWith(' '));
});

test('SKU description contains the identifiers someone would search for', () => {
  const description = skuDescription(sku, 37, ['Exchange Online (Plan 2)']);
  assert.ok(description.includes('ENTERPRISEPACK'));
  assert.ok(description.includes('Office 365 E3'));
  assert.ok(description.length <= 158);
});

// Two templates, chosen by a data rule, so 800 plan descriptions do not all
// read identically.
test('plan description leads with the technical name when the friendly name is long', () => {
  const longNamed = { ...plan, friendlyName: 'A Very Long Microsoft Service Plan Display Name That Runs On' };
  assert.ok(planDescription(longNamed, 12).startsWith('EXCHANGE_S_ENTERPRISE'));
  assert.ok(planDescription(plan, 12).startsWith('Exchange Online (Plan 2)'));
});

test('plan heading falls back to the technical name when there is no friendly one', () => {
  assert.equal(planHeading({ technicalName: 'SOME_PLAN', friendlyName: null }), 'SOME_PLAN');
  assert.equal(planHeading(plan), 'Exchange Online (Plan 2)');
});

/* ---------- page structure ---------- */

test('a SKU page puts the answer in the first viewport', () => {
  const output = renderSkuPage({ sku, plans: [{ ...plan, skuCount: 41 }], similar: { items: [], editionsOfThis: 0 }, meta, assets });
  const beforeTable = output.slice(0, output.indexOf('<table'));
  assert.ok(beforeTable.includes('Office 365 E3'), 'friendly name above the table');
  assert.ok(beforeTable.includes('ENTERPRISEPACK'), 'String ID above the table');
  assert.ok(beforeTable.includes('6fd2c87f-b296-42f0-b197-1e91e994b900'), 'GUID above the table');
});

test('a SKU page emits a canonical link, breadcrumb and DefinedTerm', () => {
  const output = renderSkuPage({ sku, plans: [], similar: { items: [], editionsOfThis: 0 }, meta, assets });
  assert.ok(output.includes('<link rel="canonical" href="https://sku2name.com/sku/enterprisepack"'));
  assert.ok(output.includes('"@type": "BreadcrumbList"'));
  assert.ok(output.includes('"@type": "DefinedTerm"'));
  // Deliberately excluded: Product without offers earns no rich result and
  // generates Search Console warnings on hundreds of pages.
  assert.ok(!output.includes('"@type": "Product"'));
});

test('a plan page links every SKU that includes it', () => {
  const owning = [{ ...sku, planCount: 37 }];
  const output = renderPlanPage({ plan, skus: owning, conflicts: null, meta, assets });
  assert.ok(output.includes('href="/sku/enterprisepack"'));
  assert.ok(output.includes('SKUs that include Exchange Online (Plan 2)'));
});

test('a plan in zero SKUs gets an explanation rather than an empty table', () => {
  const output = renderPlanPage({ plan, skus: [], conflicts: null, meta, assets });
  assert.ok(output.includes('does not appear in any SKU'));
  assert.ok(!output.includes('<table'));
});

test('a plan with no friendly name says so instead of faking one', () => {
  const degenerate = { ...plan, friendlyName: null };
  const output = renderPlanPage({ plan: degenerate, skus: [], conflicts: null, meta, assets });
  assert.ok(output.includes('does not provide a separate display name'));
  assert.ok(output.includes('<h1>EXCHANGE_S_ENTERPRISE</h1>'));
});

test('the filter bar appears only above the row count where scanning fails', () => {
  const few = Array.from({ length: 10 }, (_, i) => ({ ...plan, planId: `${i}`, slug: `p${i}`, skuCount: 1 }));
  const many = Array.from({ length: 30 }, (_, i) => ({ ...plan, planId: `${i}`, slug: `p${i}`, skuCount: 1 }));
  assert.ok(!renderSkuPage({ sku, plans: few, similar: { items: [], editionsOfThis: 0 }, meta, assets }).includes('row-filter'));
  assert.ok(renderSkuPage({ sku, plans: many, similar: { items: [], editionsOfThis: 0 }, meta, assets }).includes('row-filter'));
});

// Regression: an unscoped filter also emptied the similar-SKUs table on the
// same page and counted its rows in the total.
test('a SKU page marks exactly one filterable container', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ...plan, planId: `${i}`, slug: `p${i}`, skuCount: 1 }));
  const similar = {
    items: [{ slug: 'other', productName: 'Other SKU', stringId: 'OTHER', adds: 3, lacks: 27, total: 30, editions: 0 }],
    editionsOfThis: 0,
  };
  const output = renderSkuPage({ sku, plans: many, similar, meta, assets });

  assert.equal((output.match(/data-filterable/g) || []).length, 1);
  assert.ok(output.includes('row-filter'), 'the filter box should be present');
  // The similar-SKUs table must exist but must not be filterable.
  assert.ok(output.includes('How other SKUs compare'));
});

test('a page with a filter box always has a container for it to target', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ...plan, planId: `${i}`, slug: `p${i}`, skuCount: 1 }));
  const output = renderSkuPage({ sku, plans: many, similar: { items: [], editionsOfThis: 0 }, meta, assets });
  assert.ok(output.includes('id="row-filter"'));
  assert.ok(output.includes('data-filterable'));
});

test('every page carries the non-affiliation disclaimer', () => {
  const output = renderSkuPage({ sku, plans: [], similar: { items: [], editionsOfThis: 0 }, meta, assets });
  assert.ok(output.includes('not affiliated with or endorsed by Microsoft'));
});

/* ---------- determinism ---------- */

test('rendering the same page twice is byte-identical', () => {
  const once = renderSkuPage({ sku, plans: [{ ...plan, skuCount: 41 }], similar: { items: [], editionsOfThis: 0 }, meta, assets });
  const twice = renderSkuPage({ sku, plans: [{ ...plan, skuCount: 41 }], similar: { items: [], editionsOfThis: 0 }, meta, assets });
  assert.equal(once, twice);
});

test('no render path leaks a build timestamp', () => {
  const output = renderSkuPage({ sku, plans: [], similar: { items: [], editionsOfThis: 0 }, meta, assets });
  // The visible date must come from the dataset, not from the clock.
  assert.ok(output.includes('2026-08-14'));
  assert.ok(!output.includes(String(new Date().getFullYear() + 1)));
});

test('date and number formatting never uses locale-dependent APIs', () => {
  assert.equal(formatDate('2026-08-14'), '14 Aug 2026');
  assert.equal(formatDate(null), null);
  assert.equal(formatNumber(6001), '6,001');
  assert.equal(formatNumber(7), '7');
});

/* ---------- long identifier safety ---------- */

// Microsoft String IDs reach 103 characters with no spaces, and 12 service
// plans have no prose name at all, so a heading can BE an underscore token.
// Without wrapping these push narrow screens sideways.
test('every place an identifier can appear allows it to wrap', () => {
  const css = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
  const mustWrap = [
    ['h3 {', 'headings, which can be a technical name'],
    ['.mono {', 'monospace runs, which are always identifiers'],
    ['.browse-list a {', 'browse links, which can be a technical name'],
    ['.browse-list code {', 'browse identifiers'],
    ['table.data .name {', 'table row names'],
  ];
  for (const [selector, why] of mustWrap) {
    const at = css.indexOf(selector);
    assert.notEqual(at, -1, `selector missing: ${selector}`);
    const block = css.slice(at, css.indexOf('}', at));
    const squashed = block.split(' ').join('');
    assert.ok(
      squashed.includes('overflow-wrap:anywhere') || squashed.includes('word-break:break'),
      `${selector} must allow wrapping (${why})`
    );
  }
});

/* ---------- tokens ---------- */

test('light and dark palettes define exactly the same token names', () => {
  assert.deepEqual(Object.keys(LIGHT).sort(), Object.keys(DARK).sort());
});

test('dark is the base palette, not a media-query branch', () => {
  const css = renderTokensCss();
  // A first-time visitor must get navy regardless of their OS setting,
  // which is what sub2tenant does and what the brand manual prescribes.
  const base = css.slice(css.indexOf(':root {'), css.indexOf('}'));
  // Match the declaration, not the bare hex: Light Blue #F2F7FE is also the
  // TEXT colour in the dark palette, so a substring test passes either way.
  assert.ok(base.includes(`--bg: ${DARK['--bg']}`), 'the base :root must carry the dark background');
  assert.ok(!base.includes(`--bg: ${LIGHT['--bg']}`), 'the base :root must not be light');

  // Light is an explicit choice and nothing else. The OS is never consulted:
  // a prefers-color-scheme block reappearing here would quietly hand a light
  // OS a light site on first visit, which is the thing this test exists to
  // prevent.
  assert.ok(css.includes(':root[data-theme="light"]'));
  assert.ok(!css.includes('prefers-color-scheme'), 'the OS colour scheme must not be consulted');
  assert.ok(!css.includes('data-theme="system"'), 'the system mode was removed');

  // Both dark blocks are generated from one object, so they cannot drift.
  assert.ok(css.split(DARK['--accent']).length - 1 >= 2);
});

test('the dark accent differs from the light one, because the light blue is unreadable on navy', () => {
  assert.notEqual(LIGHT['--accent'], DARK['--accent']);
});

/* ---------- search index ---------- */

test('search index resolves every SKU and plan, and omits GUIDs', () => {
  const reverse = new Map([[plan.planId, [sku.skuId]]]);
  const { main, guid } = buildSearchIndexes({ skus: [sku], servicePlans: [plan], reverse });
  const parsed = JSON.parse(main);

  assert.deepEqual(parsed.sku.id, ['ENTERPRISEPACK']);
  assert.deepEqual(parsed.sp.id, ['EXCHANGE_S_ENTERPRISE']);
  assert.deepEqual(parsed.sku.s, ['enterprisepack']);
  // A GUID lookup is a navigation handled by /id/, so shipping 1,400
  // incompressible hex strings to every visitor would be wasted bytes.
  assert.ok(!main.includes(sku.skuId), 'the main index must not contain GUIDs');

  const guidIndex = JSON.parse(guid);
  assert.equal(guidIndex.k[0].length, guidIndex.len);
  assert.ok(guidIndex.k.some((key) => sku.skuId.replace(/-/g, '').startsWith(key)));
});

test('search index encodes a name identical to its id as empty', () => {
  const same = { ...plan, friendlyName: null, technicalName: 'SOME_PLAN' };
  const { main } = buildSearchIndexes({ skus: [], servicePlans: [same], reverse: new Map() });
  assert.deepEqual(JSON.parse(main).sp.n, ['']);
});
