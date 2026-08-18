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
  categoryChips,
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

export function renderSkuPage({ sku, plans, similar, meta, assets, categoryLabels }) {
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
    ${categoryChips(sku.categories, categoryLabels)}
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

    ${similarSection(similar)}
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

function similarSection(similar) {
  if (!similar || similar.length === 0) return '';
  return html`<h2 class="section-head">SKUs similar to this one</h2>
    <div class="table-wrap">
      <table class="data">
        <caption class="vh">SKUs sharing service plans with this one</caption>
        <thead>
          <tr>
            <th scope="col">SKU</th>
            <th scope="col" class="col-guid">Shared plans</th>
            <th scope="col"><span class="vh">Shared</span></th>
          </tr>
        </thead>
        <tbody>
          ${similar.map(
            (item) => html`<tr>
              <th scope="row">
                <a class="name" href="/sku/${item.slug}">${item.productName}</a>
                <span class="tech">${item.stringId}</span>
                <span class="guid-inline">shares ${formatNumber(item.shared)} of ${formatNumber(item.total)} plans</span>
              </th>
              <td class="col-guid tabular">${formatNumber(item.shared)} of ${formatNumber(item.total)}</td>
              <td class="cell-copy"></td>
            </tr>`
          )}
        </tbody>
      </table>
    </div>`;
}
