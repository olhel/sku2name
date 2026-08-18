// Homepage.
//
// The search field must be in the first viewport on a 375x667 phone, so there
// is no hero image, no gradient and no marketing headline above it. The h1 is
// the positioning line and doubles as the SEO heading.

import { html } from '../lib/html.mjs';
import { renderPage, canonical, formatDate, formatNumber, SITE } from './layout.mjs';
import { ctaCard } from './components.mjs';

const EXAMPLES = [
  { label: 'ENTERPRISEPACK', href: '/sku/enterprisepack' },
  { label: 'SPE_E5', href: '/sku/spe_e5' },
  { label: 'EXCHANGE_S_ENTERPRISE', href: '/service-plan/exchange_s_enterprise' },
];

export function renderHomePage({ meta, assets, counts, popular, searchIndexPath }) {
  const synced = formatDate(meta.document?.lastUpdated);

  const body = html`<h1>Look up any Microsoft 365 license SKU or service plan</h1>
    <p class="lede">
      Paste a SKU part number, GUID, product name, or service plan name. Get the friendly name,
      the technical name, and everything the license contains.
    </p>

    <form class="search" role="search" action="/browse/" method="get" id="search-form">
      <label class="vh" for="q">Search Microsoft 365 SKUs and service plans</label>
      <div class="search-field">
        <input
          id="q"
          name="q"
          type="text"
          class="search-input"
          role="combobox"
          aria-expanded="false"
          aria-controls="q-listbox"
          aria-autocomplete="list"
          aria-describedby="q-hint"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
          placeholder="Search product, SKU, GUID or service plan…"
        />
        <button type="submit" class="btn btn-primary">Look up</button>
      </div>
      <span id="q-hint" class="vh">
        Results appear below as you type. Use the up and down arrow keys to review them, Enter to
        open, Escape to dismiss.
      </span>
      <ul id="q-listbox" role="listbox" aria-label="Search results" class="listbox" hidden></ul>
      <p id="q-status" class="search-status" role="status"></p>
    </form>

    <p class="examples">
      Try:
      ${EXAMPLES.map((example) => html`<a href="${example.href}"><code>${example.label}</code></a>`)}
    </p>

    <noscript>
      <p class="note">
        Search needs JavaScript. You can still
        <a href="/browse/skus/">browse all ${formatNumber(counts.skus)} SKUs</a> or
        <a href="/browse/service-plans/">all ${formatNumber(counts.servicePlans)} service plans</a>.
      </p>
    </noscript>

    <h2 class="section-head">What you can paste</h2>
    <dl class="summary card">
      ${[
        ['SKU part number', 'ENTERPRISEPACK', '/sku/enterprisepack'],
        ['SKU GUID', '6fd2c87f-b296-42f0-b197-1e91e994b900', '/sku/enterprisepack'],
        ['Product name', 'Office 365 E3', '/sku/enterprisepack'],
        ['Service plan name', 'EXCHANGE_S_ENTERPRISE', '/service-plan/exchange_s_enterprise'],
        ['Service plan GUID', 'efb87545-963c-4e0d-99df-69c6916d9eb0', '/service-plan/exchange_s_enterprise'],
      ].map(
        ([label, example, href]) => html`<div class="summary-row">
          <dt>${label}</dt>
          <dd><a class="value" href="${href}">${example}</a></dd>
        </div>`
      )}
    </dl>

    <h2 class="section-head">Common licenses</h2>
    <div class="chips">
      ${popular.map((sku) => html`<a class="chip" href="/sku/${sku.slug}">${sku.productName}</a>`)}
    </div>

    <h2 class="section-head">Where this comes from</h2>
    <div class="note">
      <p>
        ${formatNumber(counts.skus)} SKUs and ${formatNumber(counts.servicePlans)} service plans,
        parsed from Microsoft's published licensing and service plan reference${synced ? ` and synced ${synced}` : ''}.
      </p>
      <p>
        sku2name keeps no license catalog of its own. Microsoft publishes this mapping in two
        places that do not fully agree, so sku2name reads both and merges them.
        <a href="/data/">Read how that works</a>.
      </p>
      <p>sku2name is an independent tool, not affiliated with Microsoft.</p>
    </div>

    ${ctaCard()}`;

  return renderPage({
    title: 'Microsoft 365 SKU and service plan lookup · sku2name',
    description:
      'Paste a Microsoft 365 SKU part number, GUID, product name, or service plan name and get the friendly name, the technical name, and everything the license includes. Free, no sign-in.',
    path: '/',
    body,
    assets,
    scripts: [assets.search],
    syncedIso: meta.document?.lastUpdated,
    syncedLabel: synced,
    jsonLdBlocks: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'sku2name',
        url: canonical('/'),
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: `Lookup tool for Microsoft 365 license SKUs and service plans, covering ${counts.skus} SKUs and ${counts.servicePlans} service plans.`,
        provider: { '@type': 'Organization', name: 'Bsure', url: 'https://www.bsure.io/' },
      },
    ],
  });
}

/** Injected into the page head by the build so search.js knows where to fetch. */
export function searchIndexMeta(searchIndexPath) {
  return `<meta name="search-index" content="${searchIndexPath}" />`;
}
