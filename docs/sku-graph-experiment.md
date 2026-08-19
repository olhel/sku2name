# SKU relationship graph: what we measured, and why it is not shipped

An exploration of whether the dataset supports a relationship graph on SKU
pages, and whether it can show how Microsoft composes bundles. Prototyped
against real data, rendered into a real page, then parked.

**Status: not implemented.** The concept is sound and the correctness is fine.
The ranking is not, and ranking is what decides whether the block is useful or
noise. Written down so the next attempt starts from the findings rather than
the guesses.

## The data is already a graph

621 SKUs, 798 service plans, 6,001 membership edges. Everything else is a
projection: SKU-to-SKU by shared plans, plan-to-plan co-occurrence, and the
containment DAG.

Median SKU holds **3** plans; the largest holds 111. That long tail of tiny
add-ons explains most of what follows.

## Measurements

| | |
| --- | --- |
| Has at least one superset | 184 (29.6%) |
| Has at least one subset | 261 (42.0%) |
| No containment relation at all | 192 (30.9%) |
| Byte-identical plan set to another SKU | 142 SKUs in 53 groups (22.9%) |
| Strict containment pairs | 1,924 |
| Longest containment chain | 7 (`SPE_E5`) |

The 31% with nothing are mostly single-plan add-ons. The graph is dense where
traffic is: every SKU anyone visits has rich relationships.

```
ENTERPRISEPACK      37 plans   inside 1    holds 9
SPE_E3              51 plans   inside 0    holds 19
SPE_E5              86 plans   inside 0    holds 46
ENTERPRISEPREMIUM   57 plans   inside 0    holds 23
```

## What worked

**Merge by identical plan set.** Exact, derived from the data, cannot merge two
SKUs whose contents differ. Collapses `ATP_ENTERPRISE` with its `_FACULTY`,
`_STUDENT`, `_STUDENTS_USE_BENEFIT` and `_USGOV_GCCHIGH` siblings, while
correctly leaving `_GOV` out because it holds a different plan.

**Family grouping by product-name prefix**, at a word boundary. Heuristic, but
it only reorders, so being wrong is cheap. Folds "Microsoft 365 E5 without
Audio Conferencing" under "Microsoft 365 E5" without claiming they are equal.

**Named exceptions instead of hidden ones.** When containment fails by one or
two plans, say which: *"7 plans, except EXCHANGE_S_FOUNDATION"*. Surfaces the
relationship without asserting something Microsoft's data does not support.

**Fold the tail into `<details>`**, never truncate. Nothing becomes
unreachable, and it avoids "and 1 more, including <the one thing>".

Cost was **183 bytes brotli**, against roughly 354 of headroom in the CSS
budget. Verified no horizontal overflow at 1280 and 375.

## Dead ends, so nobody repeats them

**A hand-written variant regex is wrong in both directions.** It merged every
`_GOV` edition, which usually differs (`MCOMEETADV` has 1 plan,
`MCOMEETADV_GOV` has 2), and missed `_STUDENTS_USE_BENEFIT`, which is
identical. Names do not predict contents.

**Deriving the suffix vocabulary from the data does not rescue it.** Ranking
suffixes by how many distinct SKUs carry them gives `_GOV` (33), `_GCC` (29),
`_FACULTY` (19) at the top, but `_STUDENTS_USE_BENEFIT` appears on exactly one
base, and `_P2` and `_PREMIUM` appear on three and are product **tiers**, not
editions. Frequency ranks the wrong property.

**Blanket near-containment is unusable.** Allowing any single missing plan
takes strict pairs from 1,924 to **80,272**, a 4,172% increase, because the
median SKU holds 3 plans and so almost fits inside anything. Guards are
mandatory: at least 5 plans, at most 2 missing, at least 85% covered brings it
back to a few hundred.

**`stringId` cannot drive family grouping.** The 500-seat edition of Microsoft
365 E5 has the id `Microsoft_365_E5`, which shares no prefix with `SPE_E5`.
`productName` works where the identifier does not.

## Three findings worth keeping

**Office 365 E5 contains a plan Microsoft 365 E5 does not:**
`MICROSOFT_TEAMS_EVENTS`. 56 of 57 shared. That plan appears in exactly **one**
SKU, so this is a real capability difference, not noise, and it is worth
surfacing rather than smoothing over.

**EMS E3 is 6 of 7 inside Microsoft 365 E3**, blocked only by
`EXCHANGE_S_FOUNDATION`. That plan is in **247 of 621 SKUs**, by far the most
widespread, and is a dependency stub rather than a capability. Ignoring it
alone would take containment pairs from 1,924 to 2,457, a controlled +28%.

**The self-edition problem already ships.** The existing similar-SKUs table on
the Microsoft 365 E5 page spends all five of its rows on Microsoft 365 E5
variants:

```
Microsoft 365 E5 (no Teams)                          shares 85 of 86
Microsoft 365 E5 without Audio Conferencing          shares 83 of 86
Microsoft 365 E5 (500 seats min)_HUB                 shares 82 of 86
Microsoft 365 E5 EEA (no Teams) (500 seats min)_HUB  shares 81 of 86
Microsoft 365 E5 without Audio Conferencing (500 seats min)_HUB  shares 81 of 86
```

Office 365 E5 appears nowhere on that page. This is a live defect independent
of everything above.

## Why it is parked

Ranking, not correctness.

- **Plan count is a poor proxy for importance.** Windows 10/11 Enterprise E3 is
  a pillar of the M365 E3 bundle and holds one plan, so it sorts below Exchange
  Online. There is no importance signal in the data. It would need either a
  curated list of notable SKUs, or a derived one such as how many other SKUs
  contain a given SKU.
- **Ties break badly.** `EMS_GOV` outranks `EMS` at equal size; the commercial
  product should lead.
- **The disclosure needs visual separation.** Inline, it reads as another row
  rather than a control.

## On the bundling question

Parked separately, but the structural evidence is in. `ENTERPRISEPACK` is a
strict subset of `SPE_E3`. With named exceptions the Microsoft 365 E3 page
lists Office 365 E3, Enterprise Mobility + Security E3 and Windows 10/11
Enterprise E3 among its contents, which is the composition the marketing
describes, arrived at by arithmetic rather than inference.

Worth remembering that a composition claim is **our** inference, not Microsoft's
statement. Microsoft publishes plan membership and never says "E3 is these
three". The site's promise is that it keeps no catalog of its own, so any such
claim needs framing that owns it.

## If picked up again

Cheapest real win first, and it is independent of all the above: **apply family
grouping to the existing similar-SKUs table.** Smaller change, no new section,
no new CSS, and it would put Office 365 E5 and EMS E5 onto the Microsoft 365 E5
page where an admin expects them.

Then judge whether the relationship block still adds anything. The
*"Included in ... adds 14 plans"* line probably earns its place regardless; the
"Includes" list mostly repeats what a well-ranked similarity table would show.
