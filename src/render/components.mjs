// Shared page components.

import { html, raw, esc } from '../lib/html.mjs';
import { SITE, formatDate, formatNumber } from './layout.mjs';

/** Breadcrumb trail. The last item is the current page and is not a link. */
export function breadcrumb(trail) {
  const parts = trail.map((item, index) =>
    index === trail.length - 1
      ? html`<span aria-current="page">${item.label}</span>`
      : html`<a href="${item.href}">${item.label}</a>`
  );
  return html`<nav class="breadcrumb" aria-label="Breadcrumb">${raw(parts.map(String).join(' <span aria-hidden="true">›</span> '))}</nav>`;
}

/** A copy button. The accessible name comes from a shared hidden prefix plus
 *  the row's own name, which avoids repeating a long label on every row. */
export function copyButton(value, labelledBy) {
  return html`<button type="button" class="copy" data-copy="${value}" aria-labelledby="${labelledBy}">Copy</button>`;
}

/** One row of the technical summary card. */
export function summaryRow({ label, value, mono = true, copyId = null, plain = false }) {
  const valueMarkup = plain
    ? html`<span class="value-plain">${value}</span>`
    : html`<span class="value${raw(mono ? '' : ' value-plain')}" id="${copyId || ''}">${value}</span>`;
  return html`<div class="summary-row">
      <dt>${label}</dt>
      <dd>${valueMarkup}${copyId ? copyButton(value, `${copyId}-label`) : ''}</dd>
    </div>`;
}

/** Provenance line, placed at the point of the fact rather than in a footer. */
export function provenance(meta) {
  const synced = formatDate(meta.document?.lastUpdated);
  return html`<p class="provenance">
      Source: <a href="${SITE.sourceUrl}" rel="noopener">Microsoft Learn licensing reference</a>${synced
        ? raw(
            ` · synced <time datetime="${esc(meta.document.lastUpdated)}">${esc(synced)}</time>`
          )
        : ''}
    </p>`;
}

/** Derived category chips, always labelled as sku2name's own inference. */
export function categoryChips(categories, labels) {
  if (!categories || categories.length === 0) return '';
  return html`<div class="chips">
      ${categories.map(
        (id) => html`<span class="chip chip-derived">${labels[id] || id}</span>`
      )}
      <span class="chip-note"><a href="/data/#derived">Derived by sku2name, not a Microsoft field</a></span>
    </div>`;
}

/**
 * The filter bar, rendered only above a row count where scanning stops working.
 * Below that it is noise.
 */
export function filterBar(rowCount, noun) {
  if (rowCount <= 12) return '';
  return html`<div class="filter-bar">
      <label class="vh" for="row-filter">Filter ${noun}</label>
      <input type="search" id="row-filter" placeholder="Filter ${formatNumber(rowCount)} ${noun}…" autocomplete="off" spellcheck="false" />
      <span class="filter-count" id="filter-count" aria-live="polite">${formatNumber(rowCount)} of ${formatNumber(rowCount)} shown</span>
    </div>`;
}

/**
 * A data table row.
 *
 * The GUID appears twice on purpose: once in its own column for wide screens
 * and once inside the name cell for narrow ones. CSS shows exactly one at any
 * width, so only one is ever in the accessibility tree.
 */
export function dataRow({ id, href, name, technical, guid, meta }) {
  return html`<tr>
      <th scope="row">
        <a class="name" href="${href}" id="${id}">${name}</a>
        ${technical ? html`<span class="tech">${technical}</span>` : ''}
        <span class="guid-inline">${guid}</span>
        ${meta ? html`<span class="meta">${meta}</span>` : ''}
      </th>
      <td class="col-guid">${guid}</td>
      <td class="cell-copy">${copyButton(guid, `copy-label ${id}`)}</td>
    </tr>`;
}

/** A full data table with a visually hidden caption. */
export function dataTable({ caption, columnLabel, rows }) {
  return html`<div class="table-wrap">
      <table class="data">
        <caption class="vh">${caption}</caption>
        <thead>
          <tr>
            <th scope="col">${columnLabel}</th>
            <th scope="col" class="col-guid">GUID</th>
            <th scope="col"><span class="vh">Copy</span></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Hidden label fragment shared by every copy button on the page. */
export function copyLabel(text) {
  return html`<span id="copy-label" hidden>${text}</span>`;
}

/** The one CTA per page, placed after the answer and never before it. */
export function ctaCard() {
  return html`<aside class="note" style="margin-top: var(--sp-7)">
      <strong>You know what the license contains. Now see who is actually using it.</strong>
      Bsure finds inactive identities and unused licenses across Microsoft 365 and Entra.
      <a href="${SITE.bsure}" rel="noopener">Visit Bsure</a>
    </aside>`;
}
