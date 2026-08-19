// Design tokens.
//
// Dark is the base palette rather than a prefers-color-scheme branch, so the
// site opens in the house look whatever the OS says, and light is an explicit
// choice that sticks. The palettes are generated from one object per theme
// because hand-maintaining the light copy against the base guarantees drift,
// and the drift is invisible until someone actually switches.
// Generating both from this one object removes the possibility.

export const SCALE = `
  /* ---- spacing: 4px base, no ad-hoc rem values anywhere ---- */
  --sp-1: 0.25rem;
  --sp-2: 0.5rem;
  --sp-3: 0.75rem;
  --sp-4: 1rem;
  --sp-5: 1.5rem;
  --sp-6: 2rem;
  --sp-7: 3rem;
  --sp-8: 4rem;

  /* ---- type scale ---- */
  --fs-xs:   0.75rem;
  --fs-sm:   0.8125rem;
  --fs-mono: 0.8125rem;
  --fs-base: 0.9375rem;
  --fs-md:   1rem;
  --fs-lg:   1.125rem;
  --fs-xl:   1.375rem;
  --fs-h1:   clamp(1.5rem, 1.15rem + 1.6vw, 2.125rem);

  --lh-tight: 1.2;
  --lh-snug:  1.35;
  --lh-body:  1.55;

  --fw-normal: 400;
  --fw-medium: 500;
  --fw-bold:   600;

  /* ---- radii ----
     Squared everywhere by default: pill-shaped containers around a 90-row
     data table read badly. --r-pill is for the homepage search only, which is
     the one moment sku2name and sub2tenant share. ---- */
  --r-xs: 3px;
  --r-sm: 5px;
  --r-md: 8px;
  --r-lg: 10px;
  --r-pill: 999px;

  --bw: 1px;
  --bw-accent: 3px;

  --dur-fast: 110ms;
  --dur-base: 170ms;
  --ease: cubic-bezier(0.2, 0, 0.13, 1);

  --w-prose:   68ch;
  --w-content: 1040px;
  --w-search:  620px;

  /* Taken verbatim from sub2tenant so the two tools are font-identical.
     Nothing is loaded: no webfont, no brand face, no request on the critical
     path. Note that system-ui and ui-monospace both resolve first on every
     current platform, so the rest of each list is a fallback for old
     browsers rather than a preference. */
  --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
`;

// Contrast ratios in the comments are measured, not assumed.
export const LIGHT = {
  '--bg': '#F2F7FE',
  '--surface': '#FFFFFF',
  '--surface-sunk': '#E9F0FA',
  '--surface-hover': '#E4EDFA',
  '--text': '#091A33',
  '--text-muted': '#4A5C78',
  '--text-faint': '#5C6E88',
  '--text-nav': '#33415C',
  '--accent': '#0248CE',
  '--accent-hover': '#013CAE',
  '--accent-wash': '#DCE9FF',
  '--on-accent': '#FFFFFF',
  '--btn-bg': '#0248CE',
  '--btn-fg': '#FFFFFF',
  '--btn-bg-hover': '#013CAE',
  '--border': '#D6E0EF',
  '--field-border': '#8FA6C4',
  '--field-bg': '#FFFFFF',
  // Placeholder text, weighted to read the same in both themes: 6.79:1 here
  // on the white field, 6.72:1 on the dark one.
  '--placeholder': '#4A5C78',
  '--border-strong': '#66809F',
  '--focus': '#0248CE',
  '--ok': '#007A55',
  '--ok-wash': '#CAF4E8',
  '--warn-wash': '#FEFFDE',
  '--shadow-pop': '0 1px 2px rgba(9, 26, 51, 0.06), 0 8px 24px rgba(9, 26, 51, 0.12)',
  'color-scheme': 'light',
};

export const DARK = {
  '--bg': '#091A33',
  '--surface': '#0F223D',
  '--surface-sunk': '#0B1B31',
  '--surface-hover': '#16304F',
  '--text': '#F2F7FE',
  '--text-muted': '#96A1B2',
  '--text-faint': '#8698AF',
  '--text-nav': '#A9BFD2',
  // Bright Blue is 2.34:1 on this navy and unreadable, so dark mode uses a
  // pale accent instead. Every component references var(--accent) and never a
  // literal, which is what makes the swap automatic.
  '--accent': '#8EC5FF',
  '--accent-hover': '#BEDBFF',
  '--accent-wash': '#16345C',
  '--on-accent': '#091A33',
  '--btn-bg': '#0248CE',
  '--btn-fg': '#FFFFFF',
  '--btn-bg-hover': '#0E56E8',
  '--border': '#1E3557',
  // sub2tenant's exact effective value: rgba(195,221,253,.32) resolved over
  // its input fill. See the note beside .search-input in base.css for why
  // this one control sits below the 3:1 boundary contrast.
  '--field-border': '#49566E',
  '--field-bg': '#0F172A',
  // sub2tenant's rgba(191,214,232,0.72) resolved over the field fill.
  '--placeholder': '#8EA1B3',
  // Measured against --surface, not --bg. A control's boundary is judged
  // against what sits behind the control, and the card surface is lighter
  // than the page, so #4A648C read as 3.2:1 on the page but only 2.65:1
  // where it actually appears. WCAG 1.4.11 wants 3:1.
  '--border-strong': '#546E96',
  // The focus ring is NOT --accent. --accent is pale (#8EC5FF) because it
  // has to work as link ink on navy, and at 9.84:1 as a 2px ring it reads
  // as a white glow rather than a blue rim. #2B7FFF is the product design
  // system's info indicator, clears 3:1 on every dark surface it can appear
  // over (3.56 to 4.75), and looks like sub2tenant's blue rim.
  '--focus': '#2B7FFF',
  '--ok': '#00BC7D',
  '--ok-wash': '#004F3B',
  '--warn-wash': '#432004',
  '--shadow-pop': '0 12px 32px rgba(2, 9, 19, 0.66)',
  'color-scheme': 'dark',
};

function declarations(palette, indent = '  ') {
  return Object.entries(palette)
    .map(([property, value]) => `${indent}${property}: ${value};`)
    .join('\n');
}

/**
 * Emit the palette layer.
 *
 * Dark is the BASE, not a media-query branch: it is what sub2tenant looks
 * like and what the Bsure manual calls the house default on screen, so a
 * first-time visitor gets it regardless of their OS setting. Light is an
 * explicit choice, and it persists, so the OS is never consulted.
 */
export function renderTokensCss() {
  return `/* Generated by src/render/tokens.mjs. Do not edit by hand. */
:root {
${declarations(DARK)}
${SCALE.trimEnd()}
}

/* Explicitly chosen dark. Same values, generated from the same object. */
:root[data-theme="dark"] {
${declarations(DARK)}
}

/* Explicitly chosen light. */
:root[data-theme="light"] {
${declarations(LIGHT)}
}

`;
}
