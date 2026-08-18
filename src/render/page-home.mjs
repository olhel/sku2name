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


export function renderHomePage({ meta, assets, counts }) {
  const synced = formatDate(meta.document?.lastUpdated);

  const body = html`<div class="home">
      <h1 class="vh">Look up any Microsoft 365 license SKU or service plan</h1>

      <form class="search" role="search" action="/browse/skus/" method="get" id="search-form">
        <label class="vh" for="q">Search Microsoft 365 SKUs and service plans</label>
        <div class="search-field">
          <input
            id="q"
            name="q"
            type="text"
            class="search-input"
            aria-describedby="q-hint"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="search"
            placeholder="SKU, GUID, product or service plan"
          />
          <button type="submit" class="btn btn-primary">Lookup</button>
        </div>
        <span id="q-hint" class="vh">
          Results appear below as you type. Escape clears the field.
        </span>
        <p id="q-status" class="search-status" role="status"></p>
      </form>


      <noscript>
        <p class="note">
          Search needs JavaScript. You can still
          <a href="/browse/skus/">browse all ${formatNumber(counts.skus)} SKUs</a> or
          <a href="/browse/service-plans/">all ${formatNumber(counts.servicePlans)} service plans</a>.
        </p>
      </noscript>
    </div>

    <!-- Full results live outside .home: that block is centred and capped at
         720px for the field, and a result list wants the full shell width and
         left alignment. Populated only when the URL carries ?q=. -->
    <div class="search-page" id="search-panel" hidden>
      <p id="search-summary" class="search-summary"></p>
      <ul id="search-results" class="results"></ul>
    </div>

    <p class="home-footnote">
      <strong>sku2name</strong> maps any Microsoft 365 SKU part number, GUID or service plan name to
      its friendly name and everything the license contains.
      ${formatNumber(counts.skus)} SKUs, ${formatNumber(counts.servicePlans)} service plans.
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
