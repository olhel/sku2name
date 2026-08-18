// Client-side search: index decode, tiered scorer, ARIA 1.2 combobox.
//
// Hand-rolled rather than Fuse.js or MiniSearch. Size is part of it, but the
// real objection is the scoring model: Bitap and BM25 are tuned for prose and
// have no concept of "an exact match on a technical identifier must win
// unconditionally". Their failure mode here is silent and dangerous, with
// SPE_E3 fuzzy-matching to SPE_E5, and an admin acting on that is a licensing
// incident. At ~1,400 entries a linear scan takes well under a millisecond.

const input = document.getElementById('q');
const listbox = document.getElementById('q-listbox');
const statusLine = document.getElementById('q-status');
const form = document.getElementById('search-form');
// Present only on /search/. Their presence is what switches this script from
// popover mode to full-results mode.
const resultsList = document.getElementById('search-results');
const summary = document.getElementById('search-summary');

if (input && listbox) {
  const MAX_RESULTS = 8;

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
  let active = -1;
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

  function setStatus(message) {
    if (!statusLine) return;
    clearTimeout(announceTimer);
    // Debounced, and it announces a count rather than the results themselves.
    announceTimer = setTimeout(() => {
      statusLine.textContent = message;
    }, 250);
  }

  function close() {
    listbox.hidden = true;
    listbox.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
    results = [];
    lastCount = 0;
  }

  const optionMarkup = ({ entry }, index) => {
    const badge = entry.kind === 'sku' ? 'SKU' : 'PLAN';
    const reading = entry.kind === 'sku' ? 'License SKU' : 'Service plan';
    const meta = entry.kind === 'sku' ? `${entry.count} plans` : `in ${entry.count} SKUs`;
    return `<li role="option" id="q-opt-${index}" aria-selected="false" class="opt" data-href="${escapeAttr(entry.href)}">
  <span class="opt-badge" aria-hidden="true">${badge}</span>
  <span class="opt-main">
    <span class="opt-name">${escapeHtml(entry.name)}</span>
    <span class="opt-tech">${escapeHtml(entry.id)}</span>
  </span>
  <span class="opt-meta">${escapeHtml(meta)}</span>
  <span class="vh">${reading}</span>
</li>`;
  };

  function render(scored) {
    lastCount = scored.length;
    results = scored.slice(0, MAX_RESULTS);
    active = -1;

    if (results.length === 0) {
      close();
      setStatus(input.value.trim() ? `No results for ${input.value.trim()}` : '');
      return;
    }

    // The overflow row is a real option rather than a sibling of the listbox:
    // every option here navigates, so this one navigating to the results page
    // needs no special handling in arrow keys, Enter or navigate().
    const overflow = scored.length > results.length
      ? {
          entry: {
            kind: 'more',
            id: '',
            name: `See all ${scored.length} results`,
            href: `/search/?q=${encodeURIComponent(input.value.trim())}`,
            count: 0,
          },
        }
      : null;
    if (overflow) results = results.concat(overflow);

    listbox.innerHTML = results
      .map((item, index) => {
        if (item.entry.kind === 'more') {
          return `<li role="option" id="q-opt-${index}" aria-selected="false" class="opt opt-more" data-href="${escapeAttr(item.entry.href)}">
  <span class="opt-main"><span class="opt-name">${escapeHtml(item.entry.name)}</span></span>
</li>`;
        }
        return optionMarkup(item, index);
      })
      .join('');

    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setStatus(`${scored.length} result${scored.length === 1 ? '' : 's'}`);
  }

  /* ---------- full results page ---------- */

  // A broad query can match well over a thousand entries. Rendering all of
  // them is a lot of DOM for no benefit, so this stops at PAGE_RESULTS and
  // says so rather than truncating silently.
  const PAGE_RESULTS = 200;

  function renderFull(scored) {
    lastCount = scored.length;
    results = scored.slice(0, MAX_RESULTS);
    active = -1;
    close();

    const query = input.value.trim();
    if (!query) {
      summary.textContent = '';
      resultsList.innerHTML = '';
      return;
    }
    if (scored.length === 0) {
      summary.textContent = `No results for ${query}.`;
      resultsList.innerHTML = '';
      return;
    }

    const shown = scored.slice(0, PAGE_RESULTS);
    summary.textContent =
      shown.length < scored.length
        ? `Showing the first ${shown.length} of ${scored.length} results for ${query}. Narrow the query to see the rest.`
        : `${scored.length} result${scored.length === 1 ? '' : 's'} for ${query}.`;

    resultsList.innerHTML = shown
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
  }


  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escapeAttr = escapeHtml;

  function setActive(index) {
    const options = listbox.querySelectorAll('[role="option"]');
    options.forEach((option) => option.setAttribute('aria-selected', 'false'));
    if (index < 0 || index >= options.length) {
      active = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    active = index;
    const option = options[index];
    option.setAttribute('aria-selected', 'true');
    // Focus never leaves the input; the active option is communicated only
    // through aria-activedescendant.
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  }

  function navigate(index) {
    const target = results[index];
    if (target) location.href = target.entry.href;
  }

  /* ---------- events ---------- */

  async function run() {
    const raw = input.value.trim();
    if (!raw) {
      close();
      updateUrl('');
      return;
    }

    // A full GUID is a navigation, not a search. /id/ resolves it server-side.
    const guid = asGuid(raw);
    if (guid) {
      show([
        {
          entry: {
            kind: 'sku',
            id: dashed(guid),
            name: 'Open this GUID',
            href: `/id/${dashed(guid)}`,
            count: 0,
          },
          value: 1000,
          base: T.ID_EXACT,
        },
      ]);
      updateUrl(raw);
      return;
    }

    await ensureIndex();
    if (!entries) return;

    let scored = search(raw);

    // Partial GUID: fetch the hex index only once someone has typed enough to
    // mean it, which is a small minority of sessions.
    const hex = raw.replace(/-/g, '').toLowerCase();
    if (scored.length === 0 && /^[0-9a-f]{8,}$/.test(hex)) {
      await ensureGuidIndex();
      if (guidIndex) {
        // Keys are truncated at build time, so the query is clamped to match.
        const probe = hex.slice(0, guidIndex.len || 16);
        scored = guidIndex.k
          .map((key, i) => (key.startsWith(probe) ? { key, target: guidIndex.p[guidIndex.y[i]] + guidIndex.s[i] } : null))
          .filter(Boolean)
          .slice(0, MAX_RESULTS)
          .map(({ key, target }) => ({
            entry: { kind: 'sku', id: dashed(key), name: 'Matching GUID', href: target, count: 0 },
            value: 950,
            // A partial GUID is a prefix, so it only counts as exact when it
            // narrowed to a single entry. That is checked at submit.
            base: T.ID_PREFIX,
          }));
      }
    }

    show(scored);
    updateUrl(raw);
  }

  const show = (scored) => (resultsList ? renderFull(scored) : render(scored));

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
    const count = results.length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (listbox.hidden && input.value.trim()) return void run();
      setActive(active + 1 >= count ? 0 : active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active <= 0 ? count - 1 : active - 1);
    } else if (event.key === 'Home' && active >= 0) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && active >= 0) {
      event.preventDefault();
      setActive(count - 1);
    } else if (event.key === 'Enter') {
      if (count > 0) {
        event.preventDefault();
        navigate(active >= 0 ? active : 0);
      }
    } else if (event.key === 'Escape') {
      // First press closes and keeps the text, second clears it.
      if (!listbox.hidden) close();
      else {
        input.value = '';
        updateUrl('');
      }
    } else if (event.key === 'Tab') {
      close();
    }
  });

  // preventDefault on mousedown so the input never blurs before the click.
  listbox.addEventListener('mousedown', (event) => event.preventDefault());
  listbox.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option?.dataset.href) location.href = option.dataset.href;
  });
  listbox.addEventListener('mousemove', (event) => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    setActive([...listbox.querySelectorAll('[role="option"]')].indexOf(option));
  });

  // Submit is conditional, because one button was doing two jobs badly.
  //
  // Jumping to the top hit is exactly right for a pasted identifier, which is
  // what this tool is for. It is wrong for a broad query: "e" matches 1,374
  // entries and picking one of them is arbitrary. So it navigates only when
  // the query actually named something, meaning an option was arrowed to, the
  // top hit sits in an exact tier, or there is only one result at all.
  // Anything else goes to the full results page.
  //
  // Without JavaScript the form is a real GET and the action attribute
  // handles it, so this never leaves someone stranded.
  form?.addEventListener('submit', (event) => {
    if (resultsList) {
      // Already on the results page: re-run rather than navigate away.
      event.preventDefault();
      run();
      return;
    }
    if (results.length === 0) return;
    if (active >= 0) {
      event.preventDefault();
      navigate(active);
      return;
    }
    const top = results[0];
    const named = top.base >= EXACT_TIER || lastCount === 1;
    if (named) {
      event.preventDefault();
      navigate(0);
    }
    // Otherwise fall through: the form's action is /search/ and q is the
    // input's own name, so the browser does the navigation.
  });

  // Start fetching immediately on the homepage; the index is the point here.
  ensureIndex();

  // A shared ?q= URL prefills and opens the listbox but never auto-navigates:
  // bouncing someone straight to a result breaks the back button and takes
  // away the choice they were sharing.
  const initial = new URLSearchParams(location.search).get('q');
  if (initial) {
    input.value = initial;
    ensureIndex().then(run);
  }

  // Deliberately no autofocus.
  //
  // A text input always matches :focus-visible when focused, so autofocusing
  // on load means every desktop visitor arrives at a lit-up box. sub2tenant
  // autofocuses too, but hides the effect with outline:none, which is not an
  // option here: suppressing the indicator to win back the visual is the
  // wrong trade.
  //
  // Moving focus without the user asking is also disorienting with a screen
  // reader or a magnifier. The field is the first interactive element on the
  // page, so Tab reaches it immediately, and "/" focuses it from anywhere.
}
