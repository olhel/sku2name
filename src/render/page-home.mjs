// Homepage.
//
// Deliberately minimal, matching sub2tenant: the search field is the page.
// Everything that used to sit below it (a five-row "what you can paste"
// table, fifteen license chips, a three-paragraph provenance note and a CTA)
// competed with the one thing a visitor came to do.
//
// The internal links those sections provided are not lost: /browse/ is in
// both the nav and the footer and links all 1,419 detail pages, which is the
// crawl hub the sitemap points at anyway.

import { html } from '../lib/html.mjs';
import { renderPage, canonical, formatDate, formatNumber } from './layout.mjs';

// Three, not fifteen. Enough to show what an input looks like without
// becoming a directory.
const EXAMPLES = [
  { label: 'ENTERPRISEPACK', href: '/sku/enterprisepack' },
  { label: 'SPE_E5', href: '/sku/spe_e5' },
  { label: 'EXCHANGE_S_ENTERPRISE', href: '/service-plan/exchange_s_enterprise' },
];

export function renderHomePage({ meta, assets, counts }) {
  const synced = formatDate(meta.document?.lastUpdated);

  const body = html`<div class="home">
      <h1>Look up any Microsoft 365 license SKU or service plan</h1>
      <p class="lede">
        Paste a SKU part number, GUID, product name, or service plan name.
      </p>

      <form class="search" role="search" action="/browse/skus/" method="get" id="search-form">
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
          <button type="submit" class="btn btn-primary">Lookup</button>
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
    </div>

    <p class="home-footnote">
      ${formatNumber(counts.skus)} license SKUs and ${formatNumber(counts.servicePlans)} service
      plans, parsed from Microsoft's published licensing reference${synced ? ` and synced ${synced}` : ''}.
      <a href="/data/">How this is built</a>.
    </p>`;

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
