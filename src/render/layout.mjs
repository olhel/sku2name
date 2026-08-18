// The page shell: head metadata, header, footer.

import { html, raw, esc, jsonLd } from '../lib/html.mjs';

export const SITE = {
  origin: 'https://sku2name.com',
  name: 'sku2name',
  tagline: 'Microsoft 365 SKU and service plan lookup',
  bsure: 'https://www.bsure.io/?utm_source=sku2name&utm_medium=referral',
  github: 'https://github.com/olhel/sku2name',
  sourceUrl:
    'https://learn.microsoft.com/entra/identity/users/licensing-service-plan-reference',
};

/** Absolute canonical URL for a site-relative path. */
export function canonical(path) {
  return `${SITE.origin}${path}`;
}

/**
 * Titles are capped at 60 characters. The brand segment is dropped first and
 * the entity name never, because the name is the reason the page ranks.
 */
export function buildTitle(core, { brand = true } = {}) {
  const withBrand = `${core} · ${SITE.name}`;
  if (brand && withBrand.length <= 60) return withBrand;
  return core.length <= 60 ? core : `${core.slice(0, 59).trimEnd()}…`;
}

/** Descriptions are trimmed at a sentence boundary rather than mid-word. */
export function trimDescription(text, max = 158) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastStop = cut.lastIndexOf('. ');
  if (lastStop > max * 0.6) return cut.slice(0, lastStop + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}

// The only blocking script on the site. It exists to prevent a light-to-dark
// flash on first paint, which is a real CLS and perceived-quality problem.
const THEME_INIT = `try{var t=localStorage.getItem("s2n-theme");if(t==="dark"||t==="light"||t==="system")document.documentElement.dataset.theme=t}catch(e){}`;

function head({ title, description, path, assets, robots, jsonLdBlocks, syncedIso, extraHead }) {
  const url = canonical(path);
  return html`<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
${robots ? raw(`<meta name="robots" content="${esc(robots)}" />`) : ''}
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${SITE.name}" />
<meta property="og:locale" content="en_US" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${SITE.origin}/assets/og/og-default.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${SITE.name} — ${SITE.tagline}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${SITE.origin}/assets/og/og-default.png" />
${syncedIso ? raw(`<meta name="dataset-synced" content="${esc(syncedIso)}" />`) : ''}
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${assets.css}" />
<script>${raw(THEME_INIT)}</script>
${extraHead ? raw(extraHead) : ''}
${jsonLdBlocks.map((block) => jsonLd(block))}`;
}

function header(activePath) {
  const link = (href, label) =>
    html`<a href="${href}"${raw(activePath.startsWith(href) ? ' aria-current="page"' : '')}>${label}</a>`;

  return html`<header class="site-header">
  <div class="wrap">
    <span class="brand-block">
      <a class="brand" href="/">
        <span class="wordmark">sku2name</span>
        <span class="vh">${SITE.tagline}</span>
      </a>
      <span class="byline">A free tool by <a href="${SITE.bsure}" rel="noopener">bsure.</a></span>
    </span>
    <details class="nav-disclosure">
      <summary class="nav-toggle" aria-label="Menu">
        <span></span><span></span><span></span>
      </summary>
      <nav class="site-nav" aria-label="Main">
        ${link('/browse/skus/', 'All SKUs')}
        ${link('/browse/service-plans/', 'All service plans')}
        ${link('/about/', 'About')}
        ${link('/data/', 'Data')}
        <a href="${SITE.github}" rel="noopener">GitHub</a>
        <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Theme: dark. Activate to switch to light.">Theme</button>
      </nav>
    </details>
  </div>
</header>`;
}

function footer(syncedLabel) {
  return html`<footer class="site-footer">
  <div class="wrap">
    <p>Data sourced from Microsoft Learn${syncedLabel ? raw(`, synced ${esc(syncedLabel)}`) : ''}.</p>
    <p>
      sku2name is an independent tool, not affiliated with or endorsed by Microsoft.
      Microsoft 365 and Microsoft Entra are trademarks of Microsoft Corporation.
    </p>
  </div>
</footer>`;
}

/**
 * @param {object} page
 * @param {object} page.assets manifest of hashed asset paths
 * @param {import('../lib/html.mjs').raw} page.body
 * @param {string[]} [page.scripts] extra deferred module scripts
 */
export function renderPage({
  title,
  description,
  path,
  body,
  assets,
  robots = null,
  jsonLdBlocks = [],
  scripts = [],
  syncedIso = null,
  syncedLabel = null,
  extraHead = null,
}) {
  return `<!doctype html>
<html lang="en">
<head>
${head({ title, description, path, assets, robots, jsonLdBlocks, syncedIso, extraHead })}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(path)}
<main id="main">
  <div class="wrap">
${body}
  </div>
</main>
${footer(syncedLabel)}
<p id="live-status" role="status" class="vh"></p>
<script type="module" src="${esc(assets.app)}" defer></script>
${scripts.map((src) => `<script type="module" src="${esc(src)}" defer></script>`).join('\n')}
</body>
</html>
`;
}

/** Human date for display: "14 Aug 2026". Never toLocaleDateString. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(iso) {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Thousands separator without Intl, which would vary by ICU version. */
export function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
