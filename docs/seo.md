# Search and answer-engine optimization

An audit of what sku2name ships today, measured against sub2tenant and against
what Google actually rewards in 2026. Nothing here is implemented yet.

The short version: one thing is broken in production, the icon set is a single
file, and there is almost no rich-result upside left for this kind of content.
The real opportunity is answer engines, not SERP features.

## Broken in production

### Every page advertises an OG image that does not exist

`src/render/layout.mjs` emits, on all 1,422 pages:

```
og:image      https://sku2name.com/assets/og/og-default.png   404
twitter:image https://sku2name.com/assets/og/og-default.png   404
```

`dist/assets/og/` is an empty directory. The file was never generated, so every
share on LinkedIn, Teams, Slack or X renders a blank card. sub2tenant ships a
real 25 KB `og-image.png`.

The original build plan called for **three static OG images, not 1,401
generated ones**, with `og:title` carrying the per-page specificity. That
decision still looks right. It just was never finished.

### Cloudflare AI-crawler blocking, found on and turned off

Recorded because the setting exists and its state is not obvious from the
repo, and because it flips without a deploy.

Fetched on 19 August 2026, `https://sku2name.com/robots.txt` returned our own
file with a Cloudflare managed block prepended:

```
Content-Signal: search=yes, ai-train=no, use=reference

Disallow: /   Amazonbot, Applebot-Extended, Bytespider, CCBot,
              ClaudeBot, Google-Extended, GPTBot, meta-externalagent,
              CloudflareBrowserRenderingCrawler
```

Re-checked the same day it was gone: five cache-busted fetches all returned
our own 435-byte file and nothing else. Olav had turned the managed rule off in
the Cloudflare dashboard in between.

**Decided, 19 August 2026: AI crawlers are not blocked.** That is the setting
the site should keep, because `llms.txt` exists to invite exactly the crawlers
the managed rule turned away, and being quotable by an assistant is a stated
goal rather than an accident.

**Our `robots.txt` never contained any of it.** The build output is clean, so
this is entirely a Cloudflare zone setting and cannot be fixed or pinned from
this repo.

The lesson worth keeping is that **the robots.txt served from the edge is not
the file we build**. Cloudflare can prepend to it, the change needs no deploy,
and nothing in this repo records or constrains it. Check the live URL, not
`dist/robots.txt`, whenever this matters.

Worth knowing either way: the managed list never touched Googlebot, Bingbot,
OAI-SearchBot, ChatGPT-User, PerplexityBot or plain Applebot, so classic search
indexing was never at risk even while it was active.

## The icon set is one file

Shipped: `assets/icons/favicon.svg`, 270 bytes. That is the whole set.

Confirmed 404 in production:

```
/favicon.ico            older browsers, and crawlers that probe the root blindly
/apple-touch-icon.png   iOS home screen; Slack and Teams also read it for previews
/site.webmanifest
```

Also absent from every page: `theme-color`, `rel="manifest"`, `author`.

For comparison, sub2tenant ships `favicon.svg` plus PNGs at 16, 32, 48, 64, 128
and 256, an `apple-touch-icon` pointing at the 256, and a `theme-color`.

A root `/favicon.ico` matters more than it looks. A surprising number of
crawlers and link unfurlers request it directly rather than reading the markup,
and a 404 there is a small but free loss.

## Where sku2name is already ahead

Recorded so a later pass does not improve backwards:

| | sku2name | sub2tenant |
| --- | --- | --- |
| `DefinedTerm` / `DefinedTermSet` | 1,415 pages | none |
| `BreadcrumbList` | 1,417 | 3 |
| `Dataset` + `DataDownload` | yes, on `/data/` | none |
| Per-type sitemaps | 3 | 1 |
| Content-hashed assets | yes | hand-maintained `?v=` |

`DefinedTerm` is the semantically correct type for "an identifier and what it
means", and it is a shape retrieval systems parse well, even though it produces
no SERP feature.

## Three things in sub2tenant not to copy

Checked against current Google guidance rather than assumed:

- **`HowTo`**, 4 blocks and 15 `HowToStep`s. Rich results deprecated on desktop
  in September 2023. Produces nothing.
- **`FAQPage`**, 1 block. Google dropped FAQ rich results on **7 May 2026**,
  with Rich Results Test support removed in June and Search Console API support
  in August 2026. Produces nothing in Google.
- **`keywords` meta.** Ignored by Google since 2009.

Also skip its `<link rel="preload" as="image">` of the OG image. It downloads a
25 KB image on every page load that only ever matters to a crawler.

One nuance on FAQ: the markup is still valid schema and is still parsed by
non-Google retrieval systems. Its SEO value is zero and its AEO value is not,
so it is worth considering on `/about/` and `/data/` for that reason alone,
with clear eyes about what it does not buy.

## The honest ceiling on rich results

For a reference site of identifiers there is very little left to win:

- **`BreadcrumbList`** is the only type here that produces a visible change in
  the result, and it already ships on 1,417 pages.
- **`Dataset`** can surface in Google Dataset Search, and `/data/` has it.
- **Sitelinks searchbox** was deprecated in November 2023.
- **`Product`** was excluded on purpose: nothing is for sale, and without
  `offers` it earns no rich result while generating hundreds of Search Console
  warnings.
- `FAQPage` and `HowTo` are dead, as above.

So the structured-data work is essentially done. Inventing more of it would be
busywork. **The remaining upside is in answer engines**, where the constraint is
crawler access and the quality of the summary files, not markup.

## Plan

### P0, because it is broken

1. ~~Generate three static OG images, one per page type.~~ Done on 20 August
   2026, but **not as written**. Three type-specific cards were built and
   rejected: each showed one real pair, so sharing Office 365 E3 produced a card
   reading "SPE_E5 becomes Microsoft 365 E5" under a title reading "Office 365
   E3". The image contradicted the headline on 620 of 621 SKU pages, which is
   worse than being generic. One card now describes the site and `og:title`
   carries the page, which was the division of labour all along. Per-page
   generation was costed and rejected separately: 8.9s per image cold-starting
   Chrome, so 3.5 hours, or about 2.4 minutes with a persistent browser at the
   price of Puppeteer and 300MB of Chromium in a 2.1-second build.
2. ~~Settle the Cloudflare AI-crawler policy.~~ Done on 19 August 2026: the
   managed rule is off and AI crawlers are allowed. Worth re-checking the live
   file occasionally, since the setting lives outside this repo.

### P1, icons, one pass

3. ~~Icon set.~~ Done on 20 August 2026. `favicon.ico` carrying 16/32/48,
   `apple-touch-icon.png` at 180, PNGs at 16/32/48/180/192/512,
   `site.webmanifest`, and two `theme-color` tags behind
   `prefers-color-scheme` so the browser chrome follows the palette.

   The mark changed with it. `s2` was a placeholder: two glyphs is more than a
   16px tab can hold, and it said nothing about the product. It is now `2.`,
   the numeral from sku2name with the Bsure full stop, in `#C3DDFD` on navy.
   Bidirectional-arrow marks were tried and dropped: more meaningful, since
   two-way lookup is the thing Microsoft's own reference cannot do, but a swap
   arrow is generic and less legible small.

   One caveat recorded in `scripts/make-icons.mjs`: the SVG favicon uses live
   text rather than outlined paths, so the digit differs slightly off Windows.
   Outlining needs a font library this project does not carry, and every browser
   preferring the SVG also accepts the `.ico`.

### P2, answer engines, where the actual upside is

4. **`/llm/` page and `/llm.json`.** sub2tenant has both, and they are the part
   of its setup most worth copying. sku2name has neither: both 404 today.
5. ~~Extend `llms.txt`.~~ Done on 20 August 2026, prompted by a Lighthouse
   audit that reported the file as containing no links at all. It had the H1 and
   the blockquote summary right but was otherwise prose with bare URLs, which is
   not the llmstxt.org shape. Now 14 markdown links across 7 sections, including
   the JSON endpoints, representative SKU and plan pages, the URL patterns, and
   the missing "who uses it".

   Link text avoids parentheses. `[Exchange Online (Plan 2)](url)` is valid
   CommonMark but a naive parser takes the last parenthesised group and comes
   away with `Plan 2` as the target, which is the same trap the markdown
   plan-cell parser exists to handle.
6. ~~Consider `FAQPage` on `/about/` and `/data/`.~~ Declined on 20 August
   2026. Google has rendered nothing from it since 7 May 2026, so the whole case
   rests on non-Google retrieval systems parsing it, and there is no evidence
   they do. `llms.txt` and `/llm/` already carry the same content in formats
   that are conventional.

   Cheap and unproven is exactly how sub2tenant ended up with four dead `HowTo`
   blocks that this document now tells people not to copy. Declining it on the
   record is better than adding markup on a hunch.

### Found off-plan and fixed

- **`robots.txt` carried an invalid directive.** `LLM-Content:` is not in the
  robots.txt grammar, and one unknown directive makes a validator report the
  whole file as invalid. Removed; `/llms.txt` is found by convention.
- **`og:image:alt` contained an em dash** on all 1,424 pages, against the house
  rule. Now a comma.

### Not doing

`HowTo`, `keywords`, `preload as=image`, per-page generated OG images, and
`hreflang` while the site is single-language.

## Open questions

- Whether `ai-canonical-answer`, a non-standard meta tag sub2tenant carries, is
  doing anything at all. No search engine documents it. It costs almost nothing
  and proves nothing, so it is left out until someone can point at evidence.
