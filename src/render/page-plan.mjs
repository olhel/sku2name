// Service plan detail page.
//
// The reverse lookup ("which SKUs include this plan") is the reason this page
// type exists. It does not appear anywhere in Microsoft's documentation in
// that direction, so it goes above the fold, not below.

import { html, raw } from '../lib/html.mjs';
import { renderPage, canonical, buildTitle, trimDescription, formatDate, formatNumber } from './layout.mjs';
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

export function planPath(plan) {
  return `/service-plan/${plan.slug}`;
}

export function planHeading(plan) {
  return plan.friendlyName || plan.technicalName;
}

export function planTitle(plan) {
  const core = plan.friendlyName
    ? `${plan.friendlyName} (${plan.technicalName})`
    : plan.technicalName;
  return buildTitle(`${core} · service plan`);
}

export function planDescription(plan, skuCount) {
  const inclusion = `It is included in ${skuCount} license SKU${skuCount === 1 ? '' : 's'}.`;
  // Two templates chosen by a data rule. When the friendly name is long or
  // absent, the technical name is what people actually searched for, so it
  // leads instead. This keeps 800 descriptions from reading identically.
  if (!plan.friendlyName || plan.friendlyName.length > 45) {
    return trimDescription(
      `${plan.technicalName} is the technical name for the ${plan.friendlyName || plan.technicalName} Microsoft 365 service plan, GUID ${plan.planId}. ${inclusion}`
    );
  }
  return trimDescription(
    `${plan.friendlyName} is a Microsoft 365 service plan with the technical name ${plan.technicalName} and GUID ${plan.planId}. ${inclusion}`
  );
}

export function renderPlanPage({ plan, skus, conflicts, meta, assets }) {
  const skuCount = skus.length;
  const heading = planHeading(plan);
  const description = planDescription(plan, skuCount);
  const path = planPath(plan);

  const rows = skus.map((sku, index) =>
    dataRow({
      id: `s${index}`,
      href: `/sku/${sku.slug}`,
      name: sku.productName,
      technical: sku.stringId,
      guid: sku.skuId,
      meta: `${formatNumber(sku.planCount)} plans`,
    })
  );

  const body = html`${breadcrumb([
    { href: '/', label: 'Home' },
    { href: '/browse/service-plans/', label: 'Service plans' },
    { label: heading },
  ])}
    <h1>${heading}</h1>
    <p class="lede">A Microsoft 365 service plan, included in ${formatNumber(skuCount)} license SKU${skuCount === 1 ? '' : 's'}.</p>

    <dl class="summary card">
      ${plan.friendlyName
        ? summaryRow({ label: 'Service plan name', value: plan.technicalName, copyId: 'plan-name' })
        : summaryRow({ label: 'Service plan name', value: plan.technicalName, copyId: 'plan-name' })}
      ${summaryRow({ label: 'Service plan GUID', value: plan.planId, copyId: 'plan-guid' })}
      ${summaryRow({ label: 'Included in', value: `${formatNumber(skuCount)} SKUs`, plain: true })}
    </dl>
    ${provenance(meta)}
    ${plan.retiredUpstream
      ? html`<div class="chips"><span class="chip chip-retired">Marked retired by Microsoft</span></div>`
      : ''}
    ${degenerateNote(plan)}
    ${aliasNote(plan)}

    <span id="plan-name-label" hidden>Copy service plan name</span>
    <span id="plan-guid-label" hidden>Copy service plan GUID</span>

    <h2 class="section-head">SKUs that include ${heading}</h2>
    ${skuCount === 0
      ? html`<p class="note">
          This service plan does not appear in any SKU in Microsoft's current reference. It may be
          retired, or assigned only through a bundle that the reference does not list.
        </p>`
      : html`${filterBar(skuCount, 'SKUs')}
        ${copyLabel('Copy SKU GUID for')}
        ${dataTable({
          caption: `${skuCount} license SKUs that include ${heading}`,
          columnLabel: 'License SKU',
          rows,
        })}`}

    ${conflictSection(conflicts, heading)}
    ${ctaCard()}`;

  return renderPage({
    title: planTitle(plan),
    description,
    path,
    body,
    assets,
    scripts: skuCount > 12 ? [assets.filter] : [],
    syncedIso: meta.document?.lastUpdated,
    syncedLabel: formatDate(meta.document?.lastUpdated),
    jsonLdBlocks: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: canonical('/') },
          { '@type': 'ListItem', position: 2, name: 'Service plans', item: canonical('/browse/service-plans/') },
          { '@type': 'ListItem', position: 3, name: heading, item: canonical(path) },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'DefinedTerm',
        '@id': canonical(path),
        name: heading,
        alternateName: plan.technicalName,
        termCode: plan.planId,
        description,
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          '@id': canonical('/browse/service-plans/'),
          name: 'Microsoft 365 service plans',
        },
      },
    ],
  });
}

// Never fabricate a friendly name. Saying so plainly is honest and it is also
// unique page content rather than a broken-looking heading.
function degenerateNote(plan) {
  if (plan.friendlyName) return '';
  return html`<div class="note">
      Microsoft's data does not provide a separate display name for this service plan, so the
      technical name is shown above.
    </div>`;
}

function aliasNote(plan) {
  const names = [...(plan.aliases?.friendly || []), ...(plan.aliases?.technical || [])];
  if (names.length === 0) return '';
  return html`<div class="note">
      <strong>Also appears in Microsoft's data as:</strong>
      ${raw(names.map((name) => `<span class="mono">${name}</span>`).join(', '))}.
      sku2name shows the most common spelling and keeps every variant searchable.
      <a href="/data/#names">How this is chosen</a>
    </div>`;
}

function conflictSection(conflicts, heading) {
  if (!conflicts || conflicts.members.length === 0) return '';
  return html`<h2 class="section-head">Cannot be assigned at the same time as</h2>
    <div class="note">
      Within ${conflicts.service}, Microsoft lists ${heading} as mutually exclusive with:
      <ul>
        ${conflicts.members.map(
          (member) =>
            html`<li>${member.slug ? html`<a href="/service-plan/${member.slug}">${member.name}</a>` : member.name}</li>`
        )}
      </ul>
    </div>`;
}
