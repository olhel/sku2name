// Sitemaps.
//
// A sitemap index with three children, even though ~1,400 URLs fits in one
// file, because it gives per-type coverage numbers in Search Console, which is
// exactly the diagnostic you want when the risk is partial indexing.
//
// lastmod only. Google ignores changefreq and priority and has said so.

import { SITE, canonical } from './layout.mjs';
import { skuPath } from './page-sku.mjs';
import { planPath } from './page-plan.mjs';

function urlset(paths, lastmod) {
  const entries = paths
    .map(
      (path) =>
        `  <url>\n    <loc>${canonical(path)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function renderSitemaps({ skus, servicePlans, meta, extraPaths }) {
  const lastmod = meta.document?.lastUpdated || null;

  return {
    'sitemap-pages.xml': urlset(extraPaths, lastmod),
    'sitemap-skus.xml': urlset(skus.map(skuPath), lastmod),
    'sitemap-plans.xml': urlset(servicePlans.map(planPath), lastmod),
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['sitemap-pages.xml', 'sitemap-skus.xml', 'sitemap-plans.xml']
  .map(
    (name) =>
      `  <sitemap>\n    <loc>${SITE.origin}/${name}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </sitemap>`
  )
  .join('\n')}
</sitemapindex>
`,
  };
}
