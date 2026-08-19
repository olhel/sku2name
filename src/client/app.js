// Loaded on every page. Theme toggle, copy buttons, keyboard shortcut.
//
// Detail pages are complete and correct with zero JavaScript: every name,
// identifier, relationship and link renders server-side. This file only adds
// affordances.

const THEME_KEY = 's2n-theme';
const status = document.getElementById('live-status');

/** One shared live region per page, not one per row. */
function announce(message) {
  if (status) status.textContent = message;
}

/* ---------- theme ---------- */

const toggle = document.getElementById('theme-toggle');
if (toggle) {
  // Dark is the base, so an absent attribute already means dark and "system"
  // has to be an explicit value rather than the absence of one.
  const order = ['dark', 'light', 'system'];
  const read = () => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return order.includes(stored) ? stored : 'dark';
    } catch {
      return 'dark';
    }
  };

  const apply = (mode) => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* Safari private mode throws on localStorage. */
    }
    const next = order[(order.indexOf(mode) + 1) % order.length];
    toggle.setAttribute('aria-label', `Theme: ${mode}. Activate to switch to ${next}.`);
    // Names the mode the button switches to, matching the icon. Hidden in the
    // desktop row and visible in the stacked mobile menu; it ships as "Theme"
    // so the no-script case still reads as something.
    const label = toggle.querySelector('.theme-label');
    if (label) label.textContent = next[0].toUpperCase() + next.slice(1);
  };

  apply(read());
  toggle.addEventListener('click', () => {
    const next = order[(order.indexOf(read()) + 1) % order.length];
    apply(next);
    announce(`Theme set to ${next}`);
  });
}

/* ---------- copy ---------- */

// One delegated listener rather than one per row: a large SKU page can carry
// well over a hundred copy buttons.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy');
  if (!button) return;

  const value = button.getAttribute('data-copy');
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = 'Copied';
    button.dataset.copied = 'true';
    announce(`Copied ${value}`);
    setTimeout(() => {
      button.textContent = original;
      delete button.dataset.copied;
    }, 1100);
  } catch {
    // Clipboard needs a secure context and can be blocked by permissions
    // policy, so there has to be a path that still lets someone copy.
    announce(`Could not copy automatically. The value is ${value}`);
    button.textContent = 'Ctrl+C';
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  }
});

/* ---------- keyboard shortcut ---------- */

addEventListener('keydown', (event) => {
  const isSlash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
  const isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
  if (!isSlash && !isCmdK) return;
  if (event.defaultPrevented) return;

  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  ) {
    return;
  }

  const field = document.getElementById('q') || document.getElementById('row-filter');
  if (!field) return;
  event.preventDefault();
  field.focus();
  field.select();
});
