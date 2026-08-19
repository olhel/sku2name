// Generates the Open Graph card as HTML, for rasterising to PNG at 1200x630.
//
//   node scripts/make-og.mjs
//   chrome --headless --window-size=1200,630 \
//     --screenshot=public/assets/og/og-default.png dist/_og/card.html
//
// One card for all 1,422 pages, deliberately. Two earlier attempts were worse:
//
//   Per-page generation. Measured at 8.9s per image cold-starting Chrome, so
//   3.5 hours for 1,419 cards. A persistent browser gets that to about 2.4
//   minutes, but only by adding Puppeteer and ~300MB of Chromium to a build
//   that currently takes 2.1 seconds, and 60MB of PNGs that cannot be
//   committed because the daily data refresh would regenerate them.
//
//   Three cards showing one real pair each, chosen by page type. That looked
//   good on the E5 page and was wrong everywhere else: sharing Office 365 E3
//   produced a card reading "SPE_E5 becomes Microsoft 365 E5" under a title
//   reading "Office 365 E3". The image contradicted the headline on 620 of 621
//   SKU pages, which is worse than being generic.
//
// So the card describes the site, and og:title carries the page. That is the
// division of labour the original build plan called for.
//
// Colours come from the dark palette in src/render/tokens.mjs. Accent is the
// pale #8EC5FF rather than the light theme's #0248CE, which sits at 2.34:1 on
// navy and would be unreadable.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { DARK } from '../src/render/tokens.mjs';

const skus = JSON.parse(readFileSync('data/skus.json', 'utf8'));
const plans = JSON.parse(readFileSync('data/service-plans.json', 'utf8'));

// tokens.mjs keys carry the leading dashes, because they are emitted straight
// into CSS custom properties. Reading DARK.bg silently yields undefined and
// renders a white card with black text, which is exactly what happened once.
const pick = (name) => {
  const value = DARK[`--${name}`];
  if (!value) throw new Error(`no dark token --${name}`);
  return value;
};

const C = {
  bg: pick('bg'),
  text: pick('text'),
  muted: pick('text-muted'),
  border: pick('border'),
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: ${C.bg};
    color: ${C.text};
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 68px 76px;
    position: relative; overflow: hidden;
  }
  /* The dot motif, carried through from the brand. Faint enough to read as
     texture rather than pattern once the card is scaled into a feed. */
  body::after {
    content: ""; position: absolute; inset: 0;
    background-image: radial-gradient(${C.border} 1.6px, transparent 1.6px);
    background-size: 26px 26px;
    -webkit-mask-image: linear-gradient(200deg, transparent 52%, #000 100%);
    mask-image: linear-gradient(200deg, transparent 52%, #000 100%);
    opacity: .85; pointer-events: none;
  }
  .row { display: flex; align-items: center; gap: 18px; position: relative; z-index: 1; }
  /* The same mark as the favicon: "2." in pale blue on navy, nudged up because
     a digit carries ascender space above its ink. The icon proportions, scaled
     to a 54px tile. */
  .mark {
    width: 54px; height: 54px; border-radius: 10px; background: #091A33;
    border: 1px solid ${C.border};
    display: grid; place-items: center;
  }
  .mark .g { display: flex; align-items: baseline; gap: 1.9px; transform: translateY(-1.9px); }
  .mark .n { font-size: 39px; font-weight: 700; color: #C3DDFD; line-height: 1; }
  .mark .d { width: 10.3px; height: 10.3px; border-radius: 50%; background: #C3DDFD; }
  .wordmark { font-size: 34px; font-weight: 600; letter-spacing: -.025em; }
  main { position: relative; z-index: 1; }
  .headline {
    font-size: 62px; font-weight: 600; letter-spacing: -.03em; line-height: 1.1;
  }
  /* Doubles as instructions: it is the same wording as the search placeholder. */
  .inputs { margin-top: 28px; font-size: 25px; color: ${C.muted}; }
  footer {
    display: flex; align-items: baseline; justify-content: space-between;
    position: relative; z-index: 1; font-size: 21px; color: ${C.muted};
  }
  footer b { color: ${C.text}; font-weight: 500; }
</style></head>
<body>
  <div class="row">
    <span class="mark"><span class="g"><span class="n">2</span><span class="d"></span></span></span>
    <span class="wordmark">sku2name</span>
  </div>
  <main>
    <p class="headline">Microsoft 365 SKUs and<br />service plans, decoded.</p>
    <p class="inputs">Paste a SKU, GUID, product or service plan name</p>
  </main>
  <footer>
    <span>${skus.length} SKUs &middot; ${plans.length} service plans</span>
    <span>A free tool by <b>bsure.</b></span>
  </footer>
</body></html>`;

mkdirSync('dist/_og', { recursive: true });
writeFileSync('dist/_og/card.html', html);
console.log('wrote dist/_og/card.html');
console.log('now rasterise it to public/assets/og/og-default.png at 1200x630');
