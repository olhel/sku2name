// Express over dist/.
//
// Everything the site shows is static. The server exists for the three things
// static files cannot do: /id/:guid redirects, canonical-form redirects, and
// the 404 fallback. There are no API endpoints, so there is nothing to rate
// limit and express is the only dependency.

import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visitRecord, isLoggablePath } from './src/lib/visit.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = process.env.PORT || 8080;

const app = express();
app.disable('x-powered-by');
// Cloudflare sits in front, so the client IP is in the forwarded header.
app.set('trust proxy', 1);

const idMap = existsSync(join(DIST, 'data/id-map.json'))
  ? JSON.parse(readFileSync(join(DIST, 'data/id-map.json'), 'utf8'))
  : { guid: {}, alias: {} };

const notFoundPage = existsSync(join(DIST, '404.html')) ? readFileSync(join(DIST, '404.html'), 'utf8') : 'Not found';
const idMissTemplate = existsSync(join(DIST, 'id-not-found.html'))
  ? readFileSync(join(DIST, 'id-not-found.html'), 'utf8')
  : null;

/* ---------- visit logging ---------- */

// One JSON line per page view to stdout. Container Apps forwards stdout to the
// Log Analytics workspace, so there is no client, no agent and no endpoint.
// See docs/analytics.md for what is deliberately not recorded.
//
// Server-side rather than a browser beacon on purpose: a beacon only counts
// visitors that run JavaScript, and sub2tenant's does, which is why only 3% of
// its visits are flagged as bots. Crawler traffic is the point here.
const ANALYTICS_SALT = process.env.ANALYTICS_SALT || null;

app.use((req, res, next) => {
  if (!isLoggablePath(req.path)) return next();
  const startedAt = Date.now();

  // On finish rather than up front, so the status and duration are real.
  res.on('finish', () => {
    const record = visitRecord({
      // req.path already excludes the query string; visitRecord strips it
      // again rather than trusting that.
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      referer: req.headers.referer || req.headers.referrer || null,
      userAgent: req.headers['user-agent'] || null,
      country: req.headers['cf-ipcountry'] || null,
      // Used to derive the daily hash and never written to the record.
      ip: req.headers['cf-connecting-ip'] || req.ip || null,
      secret: ANALYTICS_SALT,
      now: new Date(),
    });
    console.log('VISIT', JSON.stringify(record));
  });

  next();
});

/* ---------- security headers ---------- */

app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Every script is an external file except the one inline theme initialiser,
  // which is why 'unsafe-inline' is not needed here. Nothing on this site
  // should ever be framed, so frame-ancestors is 'none' rather than 'self'.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
});

/* ---------- health ---------- */

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

/* ---------- /id/:value ---------- */

const GUID_RE =
  /^(?:urn:uuid:)?[{(]?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})[)}]?$/i;

const dashed = (hex) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

const aliasKey = (value) => String(value).toLowerCase().replace(/[\s_-]+/g, '');

app.get('/id/:value', (req, res) => {
  const raw = String(req.params.value || '');
  const match = GUID_RE.exec(raw.trim());
  const guid = match ? dashed(match.slice(1).join('').toLowerCase()) : null;

  // A 301 keeps the alternate URL out of the index entirely and consolidates
  // link equity, which a meta-refresh stub would not.
  const target = guid ? idMap.guid[guid] : idMap.alias[aliasKey(raw)];
  if (target) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.redirect(301, target);
  }

  if (guid && idMissTemplate) {
    // Render ONLY the regex-normalised GUID, never the raw path segment. This
    // is the single user-controlled string that reaches HTML anywhere on the
    // site, so it is reconstructed from matched hex groups rather than echoed.
    res.status(404).type('html');
    return res.send(idMissTemplate.replace('{{GUID}}', guid));
  }

  return send404(res);
});

/* ---------- retired routes ---------- */

// /browse/ was a hub page holding two links. The header now points at both
// lists directly, so the hub is gone; anyone holding the old URL is sent on
// rather than shown a 404.
app.get('/browse', (req, res) => res.redirect(301, '/browse/skus/'));
app.get('/browse/', (req, res) => res.redirect(301, '/browse/skus/'));

/* ---------- canonical form redirects ---------- */

// One canonical form per URL: lowercase, no trailing slash on detail pages.
// Anything else 301s rather than being served with a 200, so no two URLs ever
// return the same content.
app.get(/^\/(sku|service-plan)\/(.+)$/, (req, res, next) => {
  const kind = req.params[0];
  const raw = req.params[1];
  const trimmed = raw.replace(/\/+$/, '');
  const lower = trimmed.toLowerCase();

  if (lower !== raw) {
    return res.redirect(301, `/${kind}/${lower}`);
  }

  if (existsSync(join(DIST, kind, `${lower}.html`))) return next();

  // Hyphen and underscore are interchangeable in a paste, so try the variants
  // before giving up.
  for (const variant of [lower.replace(/-/g, '_'), lower.replace(/_/g, '-')]) {
    if (variant !== lower && existsSync(join(DIST, kind, `${variant}.html`))) {
      return res.redirect(301, `/${kind}/${variant}`);
    }
  }
  return next();
});

/* ---------- static ---------- */

const immutable = { immutable: true, maxAge: '365d', etag: false, lastModified: false };
app.use('/assets', express.static(join(DIST, 'assets'), immutable));
app.use('/s', express.static(join(DIST, 's'), immutable));

app.use(
  express.static(DIST, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        // The edge caches for ten minutes and serves stale while revalidating,
        // so a deploy is visible quickly without the origin taking every hit.
        res.setHeader(
          'Cache-Control',
          'public, max-age=0, must-revalidate, s-maxage=600, stale-while-revalidate=86400'
        );
      } else if (/\.(json|xml|txt)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })
);

/* ---------- 404 ---------- */

function send404(res) {
  res.status(404).type('html').send(notFoundPage);
}

app.use((req, res) => send404(res));

app.listen(PORT, () => {
  console.log(`sku2name listening on http://localhost:${PORT}`);
});
