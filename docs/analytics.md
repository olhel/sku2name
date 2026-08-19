# Page visit logging

Plan for logging visits to the Log Analytics workspace the site already has.
Not implemented yet.

The short version: no new infrastructure, an Express middleware, a daily
rotating hash for unique visitors, and one decision to make about caching.

## What already exists

- **`log-sku2name-prod`**, 30-day retention, PerGB2018.
- **Container Apps already ships stdout to it.** `appLogsConfiguration` in
  `infra/main.bicep` points at the workspace, and `console.log` from
  `server.js` was confirmed landing in `ContainerAppConsoleLogs_CL`.
- **`app.set('trust proxy', 1)`** is already set, so Cloudflare's forwarded
  headers are trusted.

So this is a code change, not an infrastructure one.

## The decision to make first

Every HTML request currently reaches Azure:

```
cf-cache-status: DYNAMIC
```

That is not deliberate. Cloudflare only caches known static extensions by
default, and these pages have none, so the `s-maxage=600,
stale-while-revalidate=86400` headers written for the edge are being ignored.
**The site is not getting the CDN caching it was designed for.**

Adding a Cache Rule to fix that would make cached hits stop reaching the
origin, and origin logging would silently undercount. So:

- **Origin logging accurate, pages slower.** Leave caching as it is.
- **Pages fast, origin logging partial.** Add the Cache Rule, and accept that
  server-side counts become a floor rather than a total.

Worth choosing knowingly rather than discovering it later from a graph that
suddenly drops. Cloudflare's own Analytics stays accurate either way but is
shallow and lives outside Log Analytics. Logpush would solve it properly and
needs a paid plan; this zone is Free.

## What to log

One JSON line per request to stdout, which Container Apps forwards.

| field | source | why |
| --- | --- | --- |
| `ts` | server | |
| `path` | `req.path` | **without the query string**, see below |
| `status` | response | 404s double as a broken-link report |
| `durationMs` | server | |
| `referer` | header | where traffic actually comes from |
| `country` | `cf-ipcountry` | confirmed arriving on the Free plan |
| `isBot`, `botKind` | user-agent | see classification below |
| `visitor` | daily rotating hash | unique visitors, see below |

Skip `/healthz`, which the deploy job polls about thirty times per release, and
`/assets/*`, which are hashed and immutable and are not page views.

## What not to log, and why

**Not the query string.** `/?q=SPE_E5` does reach the server when someone opens
a shared search link. The About page says *"what you search for is never sent
anywhere"*. Logging it would make that false. Log `req.path` only.

**Not the IP.** It is needed to compute the visitor hash and must not be
written anywhere. Storing it makes this personal data under GDPR and buys
nothing that country does not already give.

**Not a stored client identifier.** sub2tenant puts a persistent UUID in
`localStorage` (`s2t_clientId`). ePrivacy covers storing information on a
user's terminal equipment regardless of mechanism, and analytics is not
strictly necessary, so in Norway that is consent territory. The About page also
says *"No cookies are set"*. The theme preference in `localStorage` is fine
because the visitor asked for it; a tracking identifier would not be.

Get these three right and no banner is needed and no page has to be rewritten.

## Unique visitors without storing anything

Derive the identifier instead of storing it, the way Plausible and Fathom do:

```
visitor = sha256(dailySalt + clientIp + userAgent + "sku2name.com").slice(0, 16)
dailySalt = sha256(ANALYTICS_SALT + utcDate)
```

- Nothing is written to the visitor's device.
- The hash cannot be reversed to an IP.
- The salt rotates at midnight UTC, so the same person is a different hash
  tomorrow and cannot be followed across days.

This gives **unique visitors per day** and views per visitor within a day. It
does not give returning visitors or retention, which for an SEO content site is
a fair trade: "how many people hit this SKU page today" is actionable, "did
this person come back in March" is not.

**The salt must be deterministic across replicas.** The app scales to four. If
each generates its own random salt, one visitor hashes four different ways and
uniques inflate by up to 4x. Deriving it from a static secret plus the UTC date
means every replica agrees without coordination. `ANALYTICS_SALT` becomes a
Container Apps secret; it is the one new piece of configuration.

## Bot classification

Reuse the shape of sub2tenant's `getBotInfo`, which is sound: named bots first,
then generic hints, then a legacy-browser heuristic.

**But fix the gap before copying it.** Its generic list has `crawler`, `spider`
and `crawl` but not plain `bot`, so these are currently classified as human:

```
AhrefsBot   SemrushBot   MJ12bot   Applebot   Amazonbot   OAI-SearchBot
```

That matters more here than for sub2tenant. Ahrefs, Semrush and MJ12 are high
volume on any indexed site, and OAI-SearchBot is exactly the LLM traffic this
site was built to attract. A corrected list with those names plus a
word-boundary `\bbot\b` catch-all was tested against 8 crawler user-agents and
6 real browser ones: all 8 caught, zero false positives.

This is a live bug in sub2tenant's numbers too, not only a gap here.

## Why server-side rather than a beacon

sub2tenant logs visits from the browser: `public/analytics.js` posts to
`/api/visit` on `DOMContentLoaded`. Its data shows why that matters, over seven
days: 1,521 VISIT events, of which **only 48 were flagged as bots**. A beacon
counts visitors that execute JavaScript, and crawlers mostly do not.

For sku2name bots are not noise. With most traffic expected to arrive from
search, "is Googlebot actually crawling all 1,428 pages" is one of the
questions worth asking, and only server-side logging answers it. The cost is
the caching trade above.

## Shape of the work

1. `ANALYTICS_SALT` as a Container Apps secret, surfaced as an env var.
2. `src/lib/bots.mjs` with the corrected classifier, and tests. It is pure
   string handling, so it is straightforward to cover properly.
3. Request middleware in `server.js`: build the record, skip the exclusions,
   `console.log('VISIT', JSON.stringify(record))`.
4. Extend the `verify-dist` or test suite with a guard that the query string
   never reaches the log record, because that is the one mistake that would
   quietly contradict a published promise.
5. KQL in this file: top pages, SKU versus plan split, referrers, bots versus
   humans, 404s, daily uniques.

## Retention

30 days is short for traffic trends, and the interesting question is whether a
page is growing over months. Two options: raise workspace retention, or add a
scheduled query that rolls daily aggregates into a small custom table and keep
that for a year while raw lines expire. The second is cheaper and enough.

## Cost

A record is roughly 200 bytes, so 100k page views is about 20 MB a month
against PerGB2018. Not a consideration at this scale.

## Verify before implementing

- Whether `Log_s` needs `parse_json(substring(Log_s, 6))` in KQL to reach the
  structured fields, as it does for sub2tenant's `VISIT ` prefix.
- Actual daily volume once real traffic arrives, which decides whether the
  rollup in the retention section is worth building.
