# Page visit logging

Implemented. One JSON line per page view to stdout, which Container Apps
forwards to the workspace the site already had. No client, no agent, no
endpoint.

Code: `src/lib/bots.mjs`, `src/lib/visit.mjs`, the middleware at the top of
`server.js`, and `test/visit.test.mjs`.

## What already exists

- **`log-sku2name-prod`**, 30-day retention, PerGB2018.
- **Container Apps already ships stdout to it.** `appLogsConfiguration` in
  `infra/main.bicep` points at the workspace, and `console.log` from
  `server.js` was confirmed landing in `ContainerAppConsoleLogs_CL`.
- **`app.set('trust proxy', 1)`** is already set, so Cloudflare's forwarded
  headers are trusted.

So this is a code change, not an infrastructure one.

## The caching decision, and why it went this way

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

**Left uncached, deliberately, so the logs are complete.** The caching being
given up is worth less than it looks:

- The hashed assets are already cached at the edge and stay that way. A CSS
  request came back `cf-cache-status: HIT` with an age of 21,254s. That is
  where the byte savings are, and none of this touches them.
- HTML caching would add a 7 to 31 KB document on a 600 second TTL, across
  1,428 pages with long-tail search traffic. Most pages are viewed rarely
  enough to expire between visits, so they would miss anyway. E3 and E5 would
  cache well; the other 1,400 would not.
- Origin TTFB is already 107 to 125 ms. That is not a page rescued by caching.

If traffic grows enough that origin latency matters for distant visitors, the
answer is to turn on HTML caching **and** add a browser beacon, keeping both
streams: the server sees bots and uncached hits, the beacon sees humans behind
the cache. Two streams reconciled in KQL. Not worth it yet.

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

## Queries

Records are written as `VISIT {json}`, so the prefix comes off before parsing.

```kusto
let visits = ContainerAppConsoleLogs_CL
  | where Log_s startswith "VISIT"
  | extend v = parse_json(substring(Log_s, 6))
  | extend path = tostring(v.path), status = toint(v.status),
           isBot = tobool(v.isBot), botKind = tostring(v.botKind),
           country = tostring(v.country), referer = tostring(v.referer),
           visitor = tostring(v.visitor), durationMs = toint(v.durationMs);
```

**Most visited pages, humans only.** Without the bot filter this is mostly
Googlebot.

```kusto
visits | where TimeGenerated > ago(7d) and not(isBot) and status == 200
| summarize views = count(), visitors = dcount(visitor) by path
| top 25 by views desc
```

**Which crawlers, and how much of the site each reaches.** The second column
against 1,428 answers whether a crawler is actually working through the site.

```kusto
visits | where TimeGenerated > ago(7d) and isBot
| summarize requests = count(), distinctPages = dcount(path) by botKind
| order by requests desc
```

**Where humans come from.**

```kusto
visits | where TimeGenerated > ago(30d) and not(isBot) and isnotempty(referer)
| summarize n = count() by referer | top 20 by n desc
```

**Daily unique visitors.** The hash rotates at midnight UTC, so this is uniques
per day and must not be summed across days.

```kusto
visits | where TimeGenerated > ago(30d) and not(isBot)
| summarize visitors = dcount(visitor), views = count() by bin(TimeGenerated, 1d)
| render timechart
```

**404s, which double as a broken-link report.** A 404 with a referer is
someone else's dead link into the site.

```kusto
visits | where TimeGenerated > ago(7d) and status == 404
| summarize n = count(), example = any(referer) by path | top 25 by n desc
```

**SKU pages versus service plan pages**, which says whether the reverse lookup
is being used at all.

```kusto
visits | where TimeGenerated > ago(30d) and not(isBot) and status == 200
| extend kind = case(path startswith "/sku/", "sku",
                     path startswith "/service-plan/", "plan",
                     path == "/", "home", "other")
| summarize views = count() by kind
```

## Retention

30 days is short for traffic trends, and the interesting question is whether a
page is growing over months. Two options: raise workspace retention, or add a
scheduled query that rolls daily aggregates into a small custom table and keep
that for a year while raw lines expire. The second is cheaper and enough.

## Cost

A record is roughly 200 bytes, so 100k page views is about 20 MB a month
against PerGB2018. Not a consideration at this scale.

## Still to check

- Actual daily volume once real traffic arrives, which decides whether the
  rollup in the retention section is worth building.
- Whether `cf-connecting-ip` or `req.ip` is the one that actually arrives in
  production. Both are read, preferring the Cloudflare header, but only
  production traffic will confirm the hash is varying per visitor rather than
  collapsing onto one Cloudflare egress address.

## First 20 hours of real data

Logging started 19 August 2026 at 14:42 UTC. By 20 August at 10:18 the workspace
held 5,586 visit records, and two things stood out.

### The AI crawlers arrived as soon as the block came off

The Cloudflare managed rule that disallowed GPTBot and friends was turned off on
the afternoon of 19 August.

| crawler | first seen | distinct pages | requests |
| --- | --- | --- | --- |
| GoogleOther | 19 Aug 23:58 | 1,374 | 1,680 |
| GPTBot | 20 Aug 06:23 | 1,434 | 1,430 |
| heritrix, Internet Archive | 20 Aug 01:06 | 103 | 103 |
| Googlebot | 19 Aug 14:43 | 22 | 36 |
| ClaudeBot | 19 Aug 14:47 | 2 | 16 |

GPTBot took the whole site, 1,434 pages, in thirteen minutes. GoogleOther swept
it overnight. Googlebot, meanwhile, has reached 22 pages: classic search
indexing has barely started while the AI crawlers went deep immediately. For a
site built to be quotable by assistants that is the most encouraging number in
the set, and it is a direct consequence of the crawler decision.

### The bot classifier was under-detecting, badly

The raw split read 3,088 bots against 2,498 humans. About 75% of those "humans"
were crawlers:

```
1,680  GoogleOther                      no "googlebot", and no "bot" at all
  103  heritrix
   50  Cloudflare-AgentReadiness
   40  a research scanner naming its institution
```

**GoogleOther is the important one.** It is Google's non-search crawler, and its
agent string contains neither `googlebot` nor even the bare substring `bot`, so
the name list and the generic hint both missed it. It reached 1,374 pages while
being counted as a person.

Two fixes, in `src/lib/bots.mjs`. `googleother` joins the named list. And a
general rule behind it: **a user-agent carrying a URL is a crawler identifying
itself**, which no shipping browser does. That catches heritrix, the
`+http://...bot.html` convention, and one-off research scanners, without another
round of name-by-name patching. Both are covered by tests built from the exact
strings production logged, and both fail two tests each when removed.

This is the same disease diagnosed in sub2tenant and then reproduced here, which
suggests the honest posture is that any user-agent list is a floor rather than a
measurement. Treat the human number as an upper bound.

### Everything else

- Most requested page is `/` at 257, then `/robots.txt` at 47. Crawlers check
  permissions before they read anything.
- 332 of 5,586 requests are 404s and **none are broken links**: `/wp-login.php`,
  `/.env`, `/.env.local`, `/.git/config` and a long tail of WordPress
  `wlwmanifest.xml` probes. Routine background scanning.
- US 4,263 and Belgium 579 are crawler infrastructure rather than an audience.
  Norway at 146 is mostly the author.
