// Client-side search: index decode, tiered scorer, live results list.
//
// The results were a popover combobox capped at eight. That hid how much it
// had found, and there was no way to reach the rest: "e3" matches 131 entries
// and "e" matches 1,374. A flat list under the field shows the count, builds
// as you type, and needs no aria-activedescendant, no roving selection and no
// overlay, because the results are ordinary links that Tab already walks.
//
// Hand-rolled rather than Fuse.js or MiniSearch. Size is part of it, but the
// real objection is the scoring model: Bitap and BM25 are tuned for prose and
// have no concept of "an exact match on a technical identifier must win
// unconditionally". Their failure mode here is silent and dangerous, with
// SPE_E3 fuzzy-matching to SPE_E5, and an admin acting on that is a licensing
// incident. At ~1,400 entries a linear scan takes well under a millisecond.

const input = document.getElementById('q');
const statusLine = document.getElementById('q-status');
const form = document.getElementById('search-form');
const panel = document.getElementById('search-panel');
const list = document.getElementById('search-results');
const summary = document.getElementById('search-summary');

if (input) {

  // The full wording runs 376px, which fits the 455px of text space on a wide
  // field and overruns a 375px phone by about nine characters. The short form
  // ships in the HTML so a phone is right before any script runs; the wide
  // viewport is upgraded here. 40rem is the site's only breakpoint, and it is
  // read through matchMedia rather than innerWidth.
  if (window.matchMedia('(min-width: 40rem)').matches) {
    input.placeholder = 'Paste a SKU, GUID, product or service plan name';
  }

  const indexUrl = document.querySelector('meta[name="search-index"]')?.content;
  const guidUrl = document.querySelector('meta[name="guid-index"]')?.content;

  let entries = null;
  let guidIndex = null;
  let pending = null;
  let results = [];
  let announceTimer = null;
  let urlTimer = null;
  // Total matches for the current query, which is not results.length: that is
  // capped at MAX_RESULTS and may carry an extra overflow row.
  let lastCount = 0;

  /* ---------- normalisation ---------- */

  // Case, space, hyphen and underscore insensitive. "spe e5", "spe-e5",
  // "SPE_E5" and "spee5" all reduce to the same key.
  const squash = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const tokens = (value) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  const GUID_RE =
    /^(?:urn:uuid:)?[{(]?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})[)}]?$/i;

  const asGuid = (value) => {
    const match = GUID_RE.exec(value.trim());
    return match ? match.slice(1).join('').toLowerCase() : null;
  };

  const dashed = (hex) =>
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

  /* ---------- index ---------- */

  function decode(payload) {
    const out = [];
    for (const [kind, block, prefix] of [
      ['sku', payload.sku, '/sku/'],
      ['plan', payload.sp, '/service-plan/'],
    ]) {
      for (let i = 0; i < block.id.length; i += 1) {
        const id = block.id[i];
        // An empty name means "same as the id", which is how the degenerate
        // case is encoded without shipping a duplicate string.
        const name = block.n[i] || id;
        const aliases = block.a[i] || [];
        out.push({
          kind,
          id,
          name,
          href: prefix + block.s[i],
          count: block.c[i],
          idSq: squash(id),
          nameSq: squash(name),
          toks: tokens(name),
          aliasSq: aliases.map(squash),
        });
      }
    }
    return out;
  }

  // GUIDs are deliberately not in the main index: 1,401 near-incompressible
  // hex strings cost ~50KB on every visit, and /id/ resolves them server-side
  // anyway. But the GUID index stores the same /sku/<slug> and
  // /service-plan/<slug> targets the main index already carries, so the two
  // join on href for free and a pasted GUID can name its product rather than
  // answering "Open this GUID", which is a dead end that costs another click.
  let byHref = null;
  const hrefIndex = () => {
    if (!byHref) {
      byHref = new Map();
      for (const entry of entries || []) byHref.set(entry.href, entry);
    }
    return byHref;
  };

  async function ensureIndex() {
    if (entries || !indexUrl) return entries;
    if (!pending) {
      pending = fetch(indexUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then((payload) => {
          entries = decode(payload);
          return entries;
        })
        .catch(() => {
          setStatus('Search is unavailable right now. Browse all SKUs or all service plans instead.');
          return null;
        });
    }
    return pending;
  }

  async function ensureGuidIndex() {
    if (guidIndex || !guidUrl) return guidIndex;
    try {
      const response = await fetch(guidUrl);
      guidIndex = await response.json();
    } catch {
      guidIndex = null;
    }
    return guidIndex;
  }

  /* ---------- scoring ---------- */

  // Tier gaps are at least 50. Modifiers below cap at 135 in total but are
  // applied within a tier only, so a popular substring match can outrank an
  // obscure one while never outranking a prefix match, and nothing can ever
  // outrank an exact technical-identifier match.
  const T = {
    ID_EXACT: 1000,
    NAME_EXACT: 900,
    ALIAS_EXACT: 850,
    // A query that exactly equals one whole word of a friendly name is
    // stronger evidence than a partial prefix of some longer identifier.
    // Without this tier, "e3" matches E3_VDA_only on ID_PREFIX and buries
    // Office 365 E3, which is what almost everyone typing "e3" means.
    NAME_TOKEN_EXACT: 750,
    ID_PREFIX: 700,
    NAME_PREFIX: 650,
    ALIAS_PREFIX: 600,
    WORD_PREFIX: 500,
    ID_SUB: 400,
    NAME_SUB: 350,
    ALIAS_SUB: 300,
    ALL_TOKENS: 200,
  };

  function score(entry, query) {
    const q = query.sq;
    let base = 0;
    let field = 'name';

    if (entry.idSq === q) { base = T.ID_EXACT; field = 'id'; }
    else if (entry.nameSq === q) base = T.NAME_EXACT;
    else if (entry.aliasSq.includes(q)) base = T.ALIAS_EXACT;
    else if (query.toks.length === 1 && entry.toks.includes(query.toks[0])) base = T.NAME_TOKEN_EXACT;
    else if (entry.idSq.startsWith(q)) { base = T.ID_PREFIX; field = 'id'; }
    else if (entry.nameSq.startsWith(q)) base = T.NAME_PREFIX;
    else if (entry.aliasSq.some((alias) => alias.startsWith(q))) base = T.ALIAS_PREFIX;
    else if (query.toks.length === 1 && entry.toks.some((token) => token.startsWith(query.toks[0]))) base = T.WORD_PREFIX;
    else if (entry.idSq.includes(q)) { base = T.ID_SUB; field = 'id'; }
    else if (entry.nameSq.includes(q)) base = T.NAME_SUB;
    else if (entry.aliasSq.some((alias) => alias.includes(q))) base = T.ALIAS_SUB;
    else if (query.toks.length > 1 && query.toks.every((token) => entry.idSq.includes(token) || entry.nameSq.includes(token))) {
      base = T.ALL_TOKENS;
    } else return null;

    const target = field === 'id' ? entry.idSq : entry.nameSq;
    const tightness = 60 * (q.length / Math.max(target.length, 1));
    const typeBias = entry.kind === 'sku' ? 15 : 0;
    const popularity = Math.min(20, 6 * Math.log2(1 + entry.count));
    const degenerate = entry.nameSq === entry.idSq ? -25 : 0;

    // base travels with the score because the tier cannot be recovered from
    // the total: modifiers run -25..+95, so ALIAS_EXACT can fall to 825 while
    // NAME_TOKEN_EXACT reaches 845. Submit needs the tier, not the total.
    return { value: base + tightness + typeBias + popularity + degenerate, base };
  }

  // Did the query name one thing outright, rather than merely match it?
  const EXACT_TIER = T.ALIAS_EXACT;

  function search(raw) {
    const query = { sq: squash(raw), toks: tokens(raw) };
    if (!query.sq || !entries) return [];

    const scored = [];
    for (const entry of entries) {
      const hit = score(entry, query);
      if (hit !== null) scored.push({ entry, value: hit.value, base: hit.base });
    }

    // Deterministic tie-break, so results never jitter between keystrokes.
    scored.sort(
      (a, b) =>
        b.value - a.value ||
        a.entry.name.length - b.entry.name.length ||
        (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === 'sku' ? -1 : 1) ||
        (a.entry.id < b.entry.id ? -1 : 1)
    );
    return scored;
  }

  /* ---------- rendering ---------- */

  // A broad query can match well over a thousand entries. Rendering all of
  // them is a lot of DOM for no benefit, so this stops at MAX_RESULTS and says
  // so rather than truncating silently.
  const MAX_RESULTS = 200;

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escapeAttr = escapeHtml;

  function setStatus(message) {
    if (!statusLine) return;
    clearTimeout(announceTimer);
    // Debounced, and it announces a count rather than the results themselves.
    // Announcing every keystroke's matches is the classic way to make a live
    // search unusable with a screen reader.
    announceTimer = setTimeout(() => {
      statusLine.textContent = message;
    }, 250);
  }

  function clear() {
    if (panel) panel.hidden = true;
    if (summary) summary.textContent = '';
    if (list) list.innerHTML = '';
    results = [];
    lastCount = 0;
    setStatus('');
  }

  function render(scored) {
    lastCount = scored.length;
    results = scored;

    const query = input.value.trim();
    if (!query) {
      clear();
      setStatus('');
      return;
    }
    if (scored.length === 0) {
      if (panel) panel.hidden = false;
      summary.textContent = `No results for ${query}.`;
      list.innerHTML = '';
      setStatus(`No results for ${query}`);
      return;
    }

    const shown = scored.slice(0, MAX_RESULTS);
    if (panel) panel.hidden = false;
    summary.textContent =
      shown.length < scored.length
        ? `Showing the first ${shown.length} of ${scored.length} results. Narrow the query to see the rest.`
        : `${scored.length} result${scored.length === 1 ? '' : 's'}.`;

    list.innerHTML = shown
      .map(({ entry }) => {
        const badge = entry.kind === 'sku' ? 'SKU' : 'PLAN';
        const reading = entry.kind === 'sku' ? 'License SKU' : 'Service plan';
        const meta = entry.kind === 'sku' ? `${entry.count} plans` : `in ${entry.count} SKUs`;
        return `<li class="result">
  <a href="${escapeAttr(entry.href)}">
    <span class="opt-badge" aria-hidden="true">${badge}</span>
    <span class="opt-main">
      <span class="opt-name">${escapeHtml(entry.name)}</span>
      <span class="opt-tech">${escapeHtml(entry.id)}</span>
    </span>
    <span class="opt-meta">${escapeHtml(meta)}</span>
    <span class="vh">${reading}</span>
  </a>
</li>`;
      })
      .join('');

    setStatus(`${scored.length} result${scored.length === 1 ? '' : 's'}`);
  }

  /* ---------- events ---------- */

  async function run() {
    const raw = input.value.trim();
    if (!raw) {
      clear();
      updateUrl('');
      return;
    }

    await ensureIndex();
    if (!entries) return;

    const full = asGuid(raw);
    let scored = full ? [] : search(raw);

    // A GUID, whole or partial. The hex index is fetched only once someone has
    // typed enough for it to mean anything, which is a small minority of
    // sessions.
    // asGuid has already normalised braces, urn:uuid: and the undashed form
    // to bare hex; stripping dashes off the raw text does not, so a pasted
    // {6FD2C87F-...} failed the hex test and never reached the index.
    const hex = full || raw.replace(/-/g, '').toLowerCase();
    if (scored.length === 0 && /^[0-9a-f]{8,}$/.test(hex)) {
      await ensureGuidIndex();
      if (guidIndex) {
        // Keys are truncated at build time, so the query is clamped to match.
        const probe = hex.slice(0, guidIndex.len || 16);
        const hrefs = hrefIndex();
        scored = guidIndex.k
          .map((key, i) => (key.startsWith(probe) ? guidIndex.p[guidIndex.y[i]] + guidIndex.s[i] : null))
          .filter(Boolean)
          .slice(0, MAX_RESULTS)
          .map((target) => hrefs.get(target))
          .filter(Boolean)
          .map((entry) => ({ entry, value: 1000, base: T.ID_EXACT }));
      }
    }

    // A well-formed GUID that resolved to nothing is still worth acting on:
    // /id/ knows about retired slugs and aliases the client index does not,
    // and its miss page explains what the GUID might be instead.
    if (scored.length === 0 && full) {
      scored = [
        {
          entry: {
            kind: 'sku',
            id: dashed(full),
            name: 'Open this GUID',
            href: `/id/${dashed(full)}`,
            count: 0,
          },
          value: 1000,
          base: T.ID_EXACT,
        },
      ];
    }

    render(scored);
    updateUrl(raw);
  }

  function updateUrl(value) {
    clearTimeout(urlTimer);
    // replaceState, never pushState: otherwise the back button walks backwards
    // through every keystroke.
    urlTimer = setTimeout(() => {
      const url = new URL(location.href);
      if (value) url.searchParams.set('q', value);
      else url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }, 500);
  }

  input.addEventListener('input', run);

  input.addEventListener('keydown', (event) => {
    // No arrow-key handling: the results are plain links in document order, so
    // Tab already walks them. Escape clears, which is the only shortcut a flat
    // list needs.
    if (event.key === 'Escape') {
      input.value = '';
      clear();
      updateUrl('');
    }
  });

  // Submit navigates only when the query named one thing outright.
  //
  // Going straight to the answer is right for a pasted identifier, which is
  // what this tool is for. It is wrong for a broad query: "e" matches 1,374
  // entries and picking one is arbitrary. In that case the list below is
  // already showing, so there is nothing for submit to do.
  //
  // Without JavaScript none of this runs and the form is a real GET to the
  // SKU browse list, which filters from ?q= on its own.
  form?.addEventListener('submit', (event) => {
    if (results.length === 0) return;
    event.preventDefault();
    const top = results[0];
    if (top.base >= EXACT_TIER || lastCount === 1) location.href = top.entry.href;
  });


  // Start fetching immediately on the homepage; the index is the point here.
  ensureIndex();

  // A shared ?q= URL prefills and renders, but never auto-navigates: bouncing
  // someone straight to a result breaks the back button and takes away the
  // choice they were sharing.
  const initial = new URLSearchParams(location.search).get('q');
  if (initial) {
    input.value = initial;
    ensureIndex().then(run);
  }

  // Focus the field on load, so the page is ready to paste into.
  //
  // Gated on a real pointer rather than a width: on a touch device this would
  // throw up the keyboard and hide the page behind it before anyone asked for
  // anything. (hover: hover) and (pointer: fine) is the signal that actually
  // means "mouse or trackpad".
  //
  // The focus ring comes with it, because a text input always matches
  // :focus-visible when focused. sub2tenant autofocuses too and hides the
  // effect with outline:none; that trade is not made here. A lit box is what
  // a focused control should look like.
  //
  // Skipped when the page was opened at an anchor, where the visitor asked to
  // be somewhere specific and moving focus would scroll them away from it.
  if (!location.hash && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    input.focus({ preventScroll: true });
  }
}
