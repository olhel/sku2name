# sku2name

Microsoft 365 SKU and service plan lookup. Paste an identifier, get a readable
answer.

Live at [sku2name.com](https://sku2name.com). Free, no sign-in, no tenant
connection, no Microsoft Graph consent.

sku2name is an independent tool, not affiliated with or endorsed by Microsoft.
Microsoft 365 and Microsoft Entra are trademarks of Microsoft Corporation.

## The problem

Microsoft publishes the mapping between product names, SKU part numbers, GUIDs
and service plans as a single reference table with several hundred rows, where
one row can hold more than a hundred service plans crammed into one cell. It is
complete and almost unusable.

It also only runs one direction. "What does `ENTERPRISEPACK` contain" is a long
scroll. "Which SKUs include `EXCHANGE_S_ENTERPRISE`" cannot be answered from it
at all, because the data is not indexed that way.

## What it does

Paste any of these and get the product it belongs to:

| You have | Example |
| --- | --- |
| A SKU part number | `ENTERPRISEPACK`, `SPE_E5` |
| A SKU GUID | `6fd2c87f-b296-42f0-b197-1e91e994b900` |
| A product name | `Office 365 E3` |
| A service plan name | `EXCHANGE_S_ENTERPRISE` |
| A service plan GUID | `efb87545-963c-4e0d-99df-69c6916d9eb0` |

Every SKU and every service plan gets its own page, so 621 SKUs and 798 service
plans in the current dataset are each a permanent URL rather than a row to
scroll to. Braces, `urn:uuid:` and undashed GUIDs are all accepted, and a GUID
resolves to the product rather than to itself.

Each page answers what the identifier is, what it contains, and what contains
it. The reverse direction, from a service plan back to every SKU that includes
it, is the thing Microsoft's table cannot do, and it is why the service plan
pages exist.

Search runs entirely in your browser against a static index, so what you type is
never sent anywhere. There are no cookies and no accounts.

## Machine-readable

The whole dataset is served as JSON, and it is the same data the site renders:

- `/data/skus.json`
- `/data/service-plans.json`
- `/data/source-meta.json`
- `/data/NOTICE.txt`

`/id/<guid>` resolves any SKU or service plan GUID and redirects to its page,
which makes it usable as a lookup endpoint from a script.

## Where the data comes from

sku2name keeps no license catalog of its own. It parses what Microsoft
publishes and presents it in a searchable form. If Microsoft's reference is
wrong, sku2name is wrong.

Microsoft publishes the same mapping in two places, and **neither is a superset
of the other**, so sku2name reads both and merges them by GUID:

| Source | Role |
| --- | --- |
| [`entra-docs` licensing reference](https://github.com/MicrosoftDocs/entra-docs/blob/main/docs/identity/users/licensing-service-plan-reference.md) (markdown) | Secondary. Supplies entities the CSV lacks, the incompatibility tables, and a commit SHA for provenance. |
| [CSV export](https://download.microsoft.com/download/e/3/e/e3e9faf2-f28b-490a-9ada-c6089a1fc5b0/Product%20names%20and%20service%20plan%20identifiers%20for%20licensing.csv) | Primary. One row per SKU/service-plan pair, already normalized, with a dedicated service plan ID column. |

Using either file alone silently drops real records, in both directions. Every
record carries a `sources` field recording which files it came from. See
[`/data/`](https://sku2name.com/data/) for the current per-source contribution
counts.

## How it is built

Three phases, cleanly separated:

1. **Ingest** (`npm run ingest`) fetches both sources, parses, merges,
   validates, and writes `data/*.json`. Runs on a schedule in CI, never at
   request time. The normalized JSON is committed; generated HTML is not.
2. **Build** (`npm run build`) turns `data/*.json` into `dist/`: 1,428 static
   HTML pages plus search indexes, sitemaps, and hashed assets. Fully
   deterministic, so two builds of the same data are byte-identical.
3. **Serve** (`npm start`) is Express over `dist/`, plus the three things
   static files cannot do: `/id/:guid` redirects, canonical-form redirects, and
   the 404 fallback.

URLs are pinned by `data/slug-registry.json`, keyed on GUID. Upstream names
change; URLs must not, so a slug that would move is a build failure rather than
a redirect.

Node 22 or newer. `express` is the only runtime dependency.

## Local development

```
npm install
npm run ingest     # fetch and rebuild data/ (network)
npm run build      # data/ -> dist/
npm start          # http://localhost:8080
npm test           # hermetic, no network
npm run verify     # post-build assertions against dist/
```

## Data refresh

A scheduled GitHub Action probes both sources with conditional requests, and
only parses when something changed. A validation gate must pass before the
dataset is written: GUID formats, count bands against the previous build,
referential integrity, slug stability, and a cross-source agreement check. If
the gate fails, nothing is written, the previous dataset keeps serving, and an
issue is opened. Failing loudly is the point.

## License and attribution

sku2name's own code and derived data are MIT licensed. See `LICENSE`.

The upstream licensing reference in `MicrosoftDocs/entra-docs` is also MIT
licensed by Microsoft Corporation, and that license explicitly covers its
documentation as well as its code. MIT requires the copyright and permission
notice to accompany substantial portions of the work, so it ships with this
project in `NOTICE` and is served at `/data/NOTICE.txt` alongside the JSON
downloads. `NOTICE` is regenerated by `npm run ingest`, and `npm run verify`
fails the build if the notice is not shipped.

What sku2name adds is its own: the reverse index from service plans to SKUs,
SKU similarity, canonical name selection, and URL slugs. The underlying facts,
the identifiers and GUIDs, are Microsoft's.

Built by [Olav Helland](https://www.linkedin.com/in/olavhelland/), paid for by
[Bsure](https://www.bsure.io/).
