// SKU detail page.
//
// The first viewport must contain the answer: friendly name, String ID, GUID
// and plan count, before any explanatory content.

import { html, raw } from '../lib/html.mjs';
import { renderPage, canonical, buildTitle, trimDescription, formatDate, formatNumber, SITE } from './layout.mjs';
import {
  breadcrumb,
  summaryRow,
  provenance,
  filterBar,
  dataRow,
  dataTable,
  copyLabel,
  ctaCard,
} from './components.mjs';

export function skuPath(sku) {
  return `/sku/${sku.slug}`;
}

export function skuTitle(sku) {
  const core = sku.stringId ? `${sku.productName} (${sku.stringId})` : sku.productName;
  return buildTitle(core);
}

export function skuDescription(sku, planCount, topPlans) {
  const base = `${sku.productName} is the Microsoft 365 license SKU with part number ${sku.stringId} and GUID ${sku.skuId}. It includes ${planCount} service plan${planCount === 1 ? '' : 's'}`;
  const withExamples = topPlans.length > 0 ? `${base}, including ${topPlans.join(' and ')}.` : `${base}.`;
  return trimDescription(withExamples);
}

export function renderSkuPage({ sku, plans, similar, meta, assets }) {
  const planCount = plans.length;
  const topPlans = plans.slice(0, 2).map((plan) => plan.friendlyName || plan.technicalName);
  const description = skuDescription(sku, planCount, topPlans);
  const path = skuPath(sku);

  const rows = plans.map((plan, index) =>
    dataRow({
      id: `p${index}`,
      href: `/service-plan/${plan.slug}`,
      name: plan.friendlyName || plan.technicalName,
      technical: plan.friendlyName ? plan.technicalName : null,
      guid: plan.planId,
      meta: plan.skuCount > 1 ? `in ${formatNumber(plan.skuCount)} SKUs` : null,
    })
  );

  const body = html`${breadcrumb([
    { href: '/', label: 'Home' },
    { href: '/browse/skus/', label: 'SKUs' },
    { label: sku.productName },
  ])}
    <h1>${sku.productName}</h1>
    <p class="lede">A Microsoft 365 license SKU containing ${formatNumber(planCount)} service plan${planCount === 1 ? '' : 's'}.</p>

    <dl class="summary card">
      ${summaryRow({ label: 'SKU part number', value: sku.stringId, copyId: 'sku-string-id' })}
      ${summaryRow({ label: 'SKU GUID', value: sku.skuId, copyId: 'sku-guid' })}
      ${summaryRow({ label: 'Included service plans', value: formatNumber(planCount), plain: true })}
    </dl>
    ${provenance(meta)}
    ${aliasNote(sku)}

    <h2 class="section-head">Service plans included in ${sku.productName}</h2>
    ${filterBar(planCount, 'service plans')}
    ${copyLabel('Copy service plan GUID for')}
    <span id="sku-string-id-label" hidden>Copy SKU part number</span>
    <span id="sku-guid-label" hidden>Copy SKU GUID</span>
    ${planCount === 0
      ? html`<p class="note">Microsoft's reference lists no service plans for this SKU.</p>`
      : dataTable({
          caption: `${planCount} service plans included in ${sku.productName}`,
          columnLabel: 'Service plan',
          rows,
        })}

    ${similarSection(similar, sku.productName)}
    ${ctaCard()}`;

  return renderPage({
    title: skuTitle(sku),
    description,
    path,
    body,
    assets,
    scripts: planCount > 12 ? [assets.filter] : [],
    syncedIso: meta.document?.lastUpdated,
    syncedLabel: formatDate(meta.document?.lastUpdated),
    jsonLdBlocks: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: canonical('/') },
          { '@type': 'ListItem', position: 2, name: 'SKUs', item: canonical('/browse/skus/') },
          { '@type': 'ListItem', position: 3, name: sku.productName, item: canonical(path) },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'DefinedTerm',
        '@id': canonical(path),
        name: sku.productName,
        alternateName: sku.stringId,
        termCode: sku.skuId,
        description,
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          '@id': canonical('/browse/skus/'),
          name: 'Microsoft 365 license SKUs',
        },
      },
    ],
  });
}

function aliasNote(sku) {
  const names = sku.aliases?.productName || [];
  if (names.length === 0) return '';
  // Renamed products keep their old name searchable, and saying so directly
  // answers "why does my export say something different".
  return html`<div class="note">
      <strong>Also appears in Microsoft's data as:</strong>
      ${raw(names.map((name) => `<span class="mono">${name}</span>`).join(', '))}.
      sku2name shows the most common spelling. Every variant is searchable.
    </div>`;
}

/**
 * How each candidate differs, rather than how much it shares.
 *
 * The table used to print "shares 82 of 86" while sorting by Jaccard, so a
 * row sharing 74 could outrank one sharing 82 and the order looked broken.
 * Jaccard was right: the 82 dragged in 29 extra plans. Showing both
 * directions explains the ranking, and it makes a contained SKU obvious,
 * which "shares 58 of 86" actively hid.
 */
function differenceNote(item) {
  if (item.adds === 0) return "already inside this SKU";
  if (item.lacks === 0) {
    return `contains all ${formatNumber(item.total)}, adds ${formatNumber(item.adds)}`;
  }
  return `adds ${formatNumber(item.adds)}, lacks ${formatNumber(item.lacks)}`;
}

function similarSection(similar, productName) {
  const items = similar?.items ?? [];
  const editions = similar?.editionsOfThis ?? 0;
  if (items.length === 0 && editions === 0) return "";

  const table = items.length
    ? html`<div class="table-wrap">
      <table class="data">
        <caption class="vh">How other SKUs differ from this one</caption>
        <thead>
          <tr>
            <th scope="col">SKU</th>
            <th scope="col" class="col-guid">Difference</th>
            <th scope="col"><span class="vh">Difference</span></th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const note = differenceNote(item);
            const editionNote = item.editions
              ? `, +${formatNumber(item.editions)} edition${item.editions === 1 ? "" : "s"}`
              : "";
            return html`<tr>
              <th scope="row">
                <a class="name" href="/sku/${item.slug}">${item.productName}</a>
                <span class="tech">${item.stringId}</span>
                <span class="guid-inline">${note}${editionNote}</span>
              </th>
              <td class="col-guid tabular">${note}${editionNote}</td>
              <td class="cell-copy"></td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`
    : "";

  // Reported rather than listed: on Microsoft 365 E5 there are eleven, and
  // they differ by region, seat minimum or bundled Teams rather than by
  // anything a reader is choosing between.
  const editionNote = editions
    ? html`<p class="note">Microsoft also sells ${formatNumber(editions)}
        other edition${raw(editions === 1 ? "" : "s")} of ${productName}, differing by region,
        seat minimum or bundled Teams. They are all searchable.</p>`
    : "";

  return html`<h2 class="section-head">How other SKUs compare</h2>
    ${table}
    ${editionNote}`;
}
