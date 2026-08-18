// In-page row filter.
//
// Rendered only above a row count where scanning stops working. Filters rows
// already in the DOM, so it never truncates content, never breaks browser
// find, and never hides anything from a crawler.
//
// Filter keys are derived from each row's own text rather than shipped as a
// data attribute. The attribute version duplicated every name, identifier and
// GUID that was already in the markup, which cost more over the wire than the
// one-off textContent read costs at runtime.

const input = document.getElementById('row-filter');
const count = document.getElementById('filter-count');
const liveRegion = document.getElementById('live-status');

if (input) {
  // Scoped to the one container marked filterable, never every table on
  // the page: a SKU page also carries the similar-SKUs table, which must not
  // be emptied by a filter aimed at the service plan list.
  const scope = document.querySelector('[data-filterable]');
  const rows = scope ? Array.from(scope.querySelectorAll(':scope > li, tbody tr')) : [];
  const total = rows.length;
  const keys = rows.map((row) => row.textContent.toLowerCase().replace(/\s+/g, ' '));

  let announceTimer = null;

  const format = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const run = () => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const match = query === '' || keys[i].includes(query);
      rows[i].hidden = !match;
      if (match) shown += 1;
    }

    const text = `${format(shown)} of ${format(total)} shown`;

    // The visible count updates immediately: showing a stale number beside a
    // filtered list is worse than no number at all.
    if (count) count.textContent = text;

    // The announcement is debounced and separate. Firing a live region on
    // every keystroke is the classic way to make a filter unusable with a
    // screen reader.
    if (liveRegion) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        liveRegion.textContent = query ? `${text} for ${query}` : text;
      }, 250);
    }
  };

  input.addEventListener('input', run);

  // Support a shared search URL landing on a browse page.
  const initial = new URLSearchParams(location.search).get('q');
  if (initial) {
    input.value = initial;
    run();
  }
}
