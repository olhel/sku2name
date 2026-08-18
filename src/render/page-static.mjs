// Browse, about, data, 404, disambiguation and GUID-not-found pages.

import { html, raw } from '../lib/html.mjs';
import { renderPage, canonical, buildTitle, formatDate, formatNumber, SITE } from './layout.mjs';
import { breadcrumb, ctaCard } from './components.mjs';

const common = (meta) => ({
  syncedIso: meta.document?.lastUpdated,
  syncedLabel: formatDate(meta.document?.lastUpdated),
});

/* ---------------------------------------------------------------- browse */

/**
 * The browse pages are three things at once: the no-JavaScript fallback, the
 * crawl hub that puts every detail page two clicks from the homepage, and the
 * destination for a submitted search form. They filter their own DOM from ?q=
 * so they never fetch the search index.
 */
export function renderBrowsePage({ kind, items, meta, assets, counts }) {
  const isSku = kind === 'sku';
  const noun = isSku ? 'SKUs' : 'service plans';
  const path = isSku ? '/browse/skus/' : '/browse/service-plans/';
  const total = items.length;

  const rows = items.map(
    (item) => html`<li>
      <a href="${item.href}">${item.name}</a>
      <code>${item.technical}</code>
    </li>`
  );

  const body = html`${breadcrumb([
    { href: '/', label: 'Home' },
    { href: '/browse/', label: 'Browse' },
    { label: isSku ? 'SKUs' : 'Service plans' },
  ])}
    <h1>All Microsoft 365 ${noun}</h1>
    <p class="lede">
      Every ${isSku ? 'license SKU' : 'service plan'} in Microsoft's licensing reference,
      ${formatNumber(total)} in total. Use your browser's find to search this page, or
      <a href="/">use the search box</a>.
    </p>
    <div class="filter-bar">
      <label class="vh" for="row-filter">Filter ${noun}</label>
      <input type="search" id="row-filter" placeholder="Filter ${formatNumber(total)} ${noun}…" autocomplete="off" spellcheck="false" />
      <span class="filter-count" id="filter-count" aria-live="polite">${formatNumber(total)} of ${formatNumber(total)} shown</span>
    </div>
    <ul class="browse-list">${rows}</ul>`;

  return renderPage({
    title: buildTitle(`All Microsoft 365 ${noun}`),
    description: `A complete list of all ${formatNumber(total)} Microsoft 365 ${noun} in Microsoft's licensing reference, with technical names and links to full details for each.`,
    path,
    body,
    assets,
    scripts: [assets.filter],
    ...common(meta),
    jsonLdBlocks: [breadcrumbLd([['Home', '/'], ['Browse', '/browse/'], [isSku ? 'SKUs' : 'Service plans', path]])],
  });
}

export function renderBrowseHubPage({ meta, assets, counts }) {
  const body = html`${breadcrumb([{ href: '/', label: 'Home' }, { label: 'Browse' }])}
    <h1>Browse</h1>
    <p class="lede">Every SKU and service plan in Microsoft's licensing reference.</p>
    <div class="chips">
      <a class="chip" href="/browse/skus/">All ${formatNumber(counts.skus)} SKUs</a>
      <a class="chip" href="/browse/service-plans/">All ${formatNumber(counts.servicePlans)} service plans</a>
    </div>`;

  return renderPage({
    title: buildTitle('Browse all Microsoft 365 SKUs and service plans'),
    description: `Browse all ${formatNumber(counts.skus)} Microsoft 365 license SKUs and ${formatNumber(counts.servicePlans)} service plans, parsed from Microsoft's published licensing reference.`,
    path: '/browse/',
    body,
    assets,
    ...common(meta),
  });
}

/* -------------------------------------------------------- disambiguation */

/**
 * Rendered when one String ID is used by two different products, which is the
 * MCOPSTN5 case. Someone who pasted that identifier genuinely cannot tell
 * which product they hold, so listing both is the useful answer.
 */
export function renderDisambiguationPage({ slug, kind, entries, meta, assets }) {
  const isSku = kind === 'sku';
  const path = `/${isSku ? 'sku' : 'service-plan'}/${slug}`;

  const body = html`${breadcrumb([
    { href: '/', label: 'Home' },
    { href: isSku ? '/browse/skus/' : '/browse/service-plans/', label: isSku ? 'SKUs' : 'Service plans' },
    { label: slug },
  ])}
    <h1><code>${slug.toUpperCase()}</code> matches ${entries.length} ${isSku ? 'products' : 'service plans'}</h1>
    <p class="lede">
      Microsoft uses this identifier for more than one
      ${isSku ? 'product, each with its own SKU GUID' : 'service plan, each with its own GUID'}.
      Pick the one whose GUID matches yours.
    </p>
    <div class="table-wrap">
      <table class="data">
        <caption class="vh">Entries sharing the identifier ${slug}</caption>
        <thead>
          <tr><th scope="col">${isSku ? 'Product' : 'Service plan'}</th><th scope="col" class="col-guid">GUID</th><th scope="col"><span class="vh">Copy</span></th></tr>
        </thead>
        <tbody>
          ${entries.map(
            (entry, index) => html`<tr>
              <th scope="row">
                <a class="name" href="${entry.href}" id="d${index}">${entry.name}</a>
                <span class="tech">${entry.technical}</span>
                <span class="guid-inline">${entry.guid}</span>
              </th>
              <td class="col-guid">${entry.guid}</td>
              <td class="cell-copy"><button type="button" class="copy" data-copy="${entry.guid}" aria-labelledby="copy-label d${index}">Copy</button></td>
            </tr>`
          )}
        </tbody>
      </table>
    </div>
    <span id="copy-label" hidden>Copy GUID for</span>`;

  return renderPage({
    title: buildTitle(`${slug.toUpperCase()} matches ${entries.length} ${isSku ? 'products' : 'plans'}`),
    description: `Microsoft uses the identifier ${slug.toUpperCase()} for ${entries.length} different ${isSku ? 'license SKUs' : 'service plans'}, each with a different GUID. Compare them and open the one you hold.`,
    path,
    body,
    assets,
    ...common(meta),
  });
}

/* ------------------------------------------------------------ about/data */

export function renderAboutPage({ meta, assets, counts }) {
  const body = html`<div class="prose">
      ${breadcrumb([{ href: '/', label: 'Home' }, { label: 'About' }])}
      <h1>About sku2name</h1>
      <p class="lede">
        A fast, free lookup for Microsoft 365 licensing identifiers. No sign-in, no tenant
        connection, no Microsoft Graph consent.
      </p>

      <h2>What it does</h2>
      <p>
        Microsoft publishes the mapping between friendly product names, SKU part numbers, GUIDs and
        service plans as a single reference table with hundreds of rows, where one row can contain
        more than a hundred service plans. It is complete and almost unusable.
      </p>
      <p>
        sku2name gives every SKU and every service plan its own page, and adds the direction
        Microsoft's table does not have: which SKUs include a given service plan.
      </p>

      <h2>What it does not do</h2>
      <p>
        sku2name keeps no license catalog of its own. Every identifier on this site comes from
        Microsoft's published reference. If Microsoft's reference is wrong, sku2name is wrong.
        It does not price licenses, recommend them, or connect to your tenant.
      </p>

      <h2>Privacy</h2>
      <p>
        There is no sign-in and no account. Lookups happen in your browser against a static index,
        so what you search for is never sent anywhere. No cookies are set.
      </p>

      <h2>Independence</h2>
      <p>
        sku2name is an independent tool, not affiliated with or endorsed by Microsoft. Microsoft
        365 and Microsoft Entra are trademarks of Microsoft Corporation. It is built and paid for
        by <a href="${SITE.bsure}" rel="noopener">Bsure</a>, and the source is on
        <a href="${SITE.github}" rel="noopener">GitHub</a>.
      </p>
      ${ctaCard()}
    </div>`;

  return renderPage({
    title: buildTitle('About sku2name'),
    description: `sku2name is a free lookup for Microsoft 365 license SKUs and service plans, covering ${formatNumber(counts.skus)} SKUs and ${formatNumber(counts.servicePlans)} service plans. No sign-in, no tenant connection.`,
    path: '/about/',
    body,
    assets,
    ...common(meta),
  });
}

/**
 * The data page. "Microsoft publishes this in two places that disagree, here
 * is exactly how" is the most interesting thing on the site and the strongest
 * answer to the thin-content risk that any generated reference site carries.
 */
export function renderDataPage({ meta, assets, counts, categories }) {
  const csv = meta.sources?.csv || {};
  const markdown = meta.sources?.markdown || {};

  const body = html`<div class="prose">
      ${breadcrumb([{ href: '/', label: 'Home' }, { label: 'Data' }])}
      <h1>Where this data comes from</h1>
      <p class="lede">
        sku2name parses what Microsoft publishes and presents it in a searchable form. It maintains
        no catalog of its own.
      </p>

      <h2>Two sources, because neither is complete</h2>
      <p>
        Microsoft publishes the same mapping twice, and the two files do not agree. Rather than
        pick one and silently lose records, sku2name reads both and merges them by GUID.
      </p>
      <ul>
        <li>
          <strong>The markdown reference</strong> in the
          <a href="https://github.com/MicrosoftDocs/entra-docs/blob/main/docs/identity/users/licensing-service-plan-reference.md" rel="noopener">entra-docs repository</a>.
          It lives in public source control, so a change is attributable to a commit.
        </li>
        <li>
          <strong>The CSV export</strong> linked from that page. It has one row per SKU and service
          plan pair with a dedicated service plan ID column, so it is far cleaner to parse.
        </li>
      </ul>
      <p>
        In the current sync, ${formatNumber(counts.skusFromCsvOnly)} SKUs appear only in the CSV,
        and ${formatNumber(counts.edgesFromMdOnly)} SKU-to-plan relationships appear only in the
        markdown. Using either file alone would silently drop real records.
      </p>

      <h2>Current sync</h2>
      <dl class="summary card">
        ${row('Microsoft last updated', formatDate(meta.document?.lastUpdated) || 'unknown')}
        ${row('Document ms.date', meta.document?.msDate || 'unknown')}
        ${row('Upstream commit', markdown.commitSha ? markdown.commitSha.slice(0, 12) : 'unavailable')}
        ${row('SKUs', formatNumber(counts.skus))}
        ${row('Service plans', formatNumber(counts.servicePlans))}
        ${row('SKU to plan relationships', formatNumber(counts.edges))}
        ${row('Dataset hash', (meta.datasetHash || '').replace('sha256:', '').slice(0, 16))}
      </dl>

      <h2 id="names">How a display name is chosen</h2>
      <p>
        ${formatNumber(counts.plansWithAliases)} service plans appear in Microsoft's data under more
        than one name. sku2name picks one canonically, using a fixed rule so the same input always
        produces the same output:
      </p>
      <ol>
        <li>Prefer a name whose shape matches its kind: <code>UNDERSCORE_CAPS</code> for technical names, prose for display names.</li>
        <li>Then prefer a name that both Microsoft files agree on.</li>
        <li>Then prefer the more frequent spelling.</li>
        <li>Then prefer a display name that differs from the technical name.</li>
        <li>Finally, sort alphabetically, so the result is never ambiguous.</li>
      </ol>
      <p>
        Every rejected spelling is kept, listed on the plan's page, and remains searchable.
        Where Microsoft provides no display name distinct from the technical name, sku2name says so
        rather than inventing one. That is the case for ${formatNumber(counts.plansWithoutFriendlyName)} plans.
      </p>

      <h2 id="derived">Derived categories</h2>
      <p>
        These labels are <strong>sku2name's own</strong>, inferred from naming patterns. They are
        not Microsoft fields and Microsoft does not publish them. They exist for navigation only.
      </p>
      <div class="table-wrap">
        <table class="data">
          <caption class="vh">Derived category rules</caption>
          <thead><tr><th scope="col">Label</th><th scope="col">Matched when</th></tr></thead>
          <tbody>
            ${categories.map(
              (category) => html`<tr><th scope="row">${category.label}</th><td>${category.describe}</td></tr>`
            )}
          </tbody>
        </table>
      </div>

      <h2>Known caveats</h2>
      <ul>
        <li>Some technical names in Microsoft's data contain stray spaces or are ALL CAPS. These are shown as published, with obvious whitespace defects repaired.</li>
        <li>The CSV's own last-modified date is unreliable: it has read older than the markdown while carrying newer SKUs. sku2name ignores it and compares content instead.</li>
        <li>A handful of entries in the conflict tables reference plans that are not in the main table. They are shown as plain text rather than broken links.</li>
      </ul>

      <h2>Raw data</h2>
      <p>
        The normalized dataset is available as JSON:
        <a href="/data/skus.json">skus.json</a>,
        <a href="/data/service-plans.json">service-plans.json</a>.
        The underlying facts are Microsoft's.
      </p>
    </div>`;

  return renderPage({
    title: buildTitle('Data sources and method'),
    description: `How sku2name builds its dataset: it parses both of Microsoft's published licensing references, merges them by GUID because neither is complete, and publishes the exact rules it uses to pick names.`,
    path: '/data/',
    body,
    assets,
    ...common(meta),
    jsonLdBlocks: [
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'Microsoft 365 SKU and service plan identifiers',
        description: `Normalized mapping of ${counts.skus} Microsoft 365 license SKUs to ${counts.servicePlans} service plans, merged from Microsoft's published markdown and CSV references.`,
        url: canonical('/data/'),
        creator: { '@type': 'Organization', name: 'Bsure', url: 'https://www.bsure.io/' },
        isBasedOn: [markdown.url, csv.url].filter(Boolean),
        distribution: [
          { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: canonical('/data/skus.json') },
          { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: canonical('/data/service-plans.json') },
        ],
      },
    ],
  });
}

function row(label, value) {
  return html`<div class="summary-row"><dt>${label}</dt><dd><span class="value">${value}</span></dd></div>`;
}

/* ------------------------------------------------------------ error pages */

export function render404Page({ meta, assets, counts }) {
  const body = html`<h1>That page is not here</h1>
    <p class="lede">The page you asked for does not exist on sku2name.</p>
    <div class="chips">
      <a class="chip" href="/">Search</a>
      <a class="chip" href="/browse/skus/">All ${formatNumber(counts.skus)} SKUs</a>
      <a class="chip" href="/browse/service-plans/">All ${formatNumber(counts.servicePlans)} service plans</a>
    </div>`;

  return renderPage({
    title: buildTitle('Page not found'),
    description: 'That page does not exist on sku2name.',
    path: '/404',
    body,
    assets,
    robots: 'noindex',
    ...common(meta),
  });
}

/**
 * Shown when a well-formed GUID is not in Microsoft's licensing reference.
 *
 * The GUID is rendered by the server from the regex-normalised value only,
 * never from the raw path segment: it is the one user-controlled string that
 * reaches HTML anywhere on this site.
 */
export function renderIdNotFoundPage({ meta, assets, guidPlaceholder = '{{GUID}}' }) {
  const body = html`<h1>That GUID is not a Microsoft 365 SKU or service plan</h1>
    <p class="lede">
      <code id="echoed-guid">${guidPlaceholder}</code> is a well-formed GUID, but it does not appear
      in Microsoft's licensing reference as a SKU or a service plan identifier.
    </p>
    <h2 class="section-head">What it might be instead</h2>
    <div class="table-wrap">
      <table class="data">
        <caption class="vh">Other things a GUID of this shape could be</caption>
        <thead><tr><th scope="col">If it is a…</th><th scope="col">Try</th></tr></thead>
        <tbody>
          <tr><th scope="row">Tenant ID or Azure subscription ID</th><td><a href="https://sub2tenant.com" rel="noopener">sub2tenant.com</a></td></tr>
          <tr><th scope="row">Entra object ID (user, group, service principal)</th><td>The Microsoft Entra admin center</td></tr>
          <tr><th scope="row">Application (client) ID</th><td>The Microsoft Entra admin center</td></tr>
          <tr><th scope="row">Retired SKU</th><td><a href="/browse/skus/">Search by name instead</a></td></tr>
        </tbody>
      </table>
    </div>`;

  return renderPage({
    title: buildTitle('GUID not found'),
    description: 'That GUID does not appear in Microsoft licensing reference as a SKU or service plan identifier.',
    path: '/id/',
    body,
    assets,
    robots: 'noindex',
    ...common(meta),
  });
}

function breadcrumbLd(pairs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: pairs.map(([name, path], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: canonical(path),
    })),
  };
}
