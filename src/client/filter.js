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

if (input) {
  const rows = Array.from(document.querySelectorAll('.browse-list > li, table.data tbody tr'));
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

    if (count) {
      // Debounced, and it announces a count rather than the matches. Announcing
      // every keystroke's results is what makes a filter unusable with a
      // screen reader.
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        count.textContent = `${format(shown)} of ${format(total)} shown`;
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
