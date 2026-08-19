// Generates the icon set: the mark is "2." in pale blue on navy.
//
//   node scripts/make-icons.mjs prepare    writes dist/_icons/*.html
//   <rasterise each to public/assets/icons/icon-<size>.png>
//   node scripts/make-icons.mjs assemble   builds favicon.ico, manifest, svg
//
// The mark is the "2" of sku2name with the Bsure full stop after it, echoing
// the "bsure." wordmark the site already carries in its header. One glyph plus
// a dot is about the most a 16px browser tab can hold, which ruled out the
// previous "s2" and the various arrow marks: two characters turn to mush and a
// bidirectional arrow is the swap glyph on a thousand other products.
//
// Navy ground with a #C3DDFD mark. That is the brand's light blue and sits at
// 12.5:1 on #091A33. Bright Blue #0248CE would be 2.34:1 there, unreadable.
//
// The glyph is nudged up by 3.5% of the box. A digit carries ascender space
// above its ink, so centring the em box leaves the mark looking low; the
// correction is what made the numeral look the right size without growing it.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const NAVY = '#091A33';
const PALE = '#C3DDFD';

/** Proportions, as fractions of the box. Shared by the PNG and SVG paths. */
const M = {
  radius: 0.1875,
  numeral: 0.72,
  dot: 0.19,
  gap: 0.035,
  nudge: 0.035,
};

/** One HTML page per size, for Chrome to screenshot at exactly that box. */
const page = (size) => `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; }
  .m {
    width: ${size}px; height: ${size}px;
    background: ${NAVY};
    border-radius: ${Math.round(size * M.radius)}px;
    display: grid; place-items: center;
    color: ${PALE};
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
    font-weight: 700; line-height: 1;
  }
  .g {
    display: flex; align-items: baseline; gap: ${size * M.gap}px;
    transform: translateY(${-size * M.nudge}px);
  }
  .n { font-size: ${Math.round(size * M.numeral)}px; }
  .d {
    width: ${size * M.dot}px; height: ${size * M.dot}px;
    border-radius: 50%; background: ${PALE};
  }
</style></head>
<body><div class="m"><span class="g"><span class="n">2</span><span class="d"></span></span></div></body></html>`;

/**
 * The SVG favicon uses live text rather than outlined paths, so it renders in
 * whatever sans the viewer has. On Windows, which is nearly all of this
 * audience, that is the same Segoe UI the PNGs were baked from. Elsewhere the
 * digit differs slightly. Outlining it would need a font library this project
 * does not carry, and every browser that prefers the SVG also accepts the PNGs
 * below it, so the cost of being wrong is small.
 */
const svg = () => {
  const S = 64;
  const r = Math.round(S * M.radius);
  const cx = S * 0.615;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${r}" fill="${NAVY}"/>
  <text x="${S * 0.30}" y="${S * 0.70}" fill="${PALE}" text-anchor="middle"
        font-family="Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
        font-size="${S * M.numeral}" font-weight="700">2</text>
  <circle cx="${cx + S * 0.055}" cy="${S * 0.615}" r="${(S * M.dot) / 2}" fill="${PALE}"/>
</svg>
`;
};

const manifest = {
  name: 'sku2name',
  short_name: 'sku2name',
  description: 'Microsoft 365 SKUs and service plans, decoded.',
  start_url: '/',
  scope: '/',
  display: 'browser',
  background_color: '#F2F7FE',
  theme_color: NAVY,
  icons: [
    { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/assets/icons/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
  ],
};

/**
 * ICO is a thin container: a 6-byte directory, one 16-byte entry per image,
 * then the payloads. Every browser that matters has accepted PNG payloads
 * since Vista, so there is no need to encode BMP by hand.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

export const SIZES = [16, 32, 48, 180, 192, 512];

const mode = process.argv[2] || 'prepare';

if (mode === 'prepare') {
  mkdirSync('dist/_icons', { recursive: true });
  for (const size of SIZES) writeFileSync(`dist/_icons/icon-${size}.html`, page(size));
  console.log(`wrote ${SIZES.length} files to dist/_icons/`);
} else if (mode === 'assemble') {
  const parts = [16, 32, 48].map((size) => {
    const p = `public/assets/icons/icon-${size}.png`;
    if (!existsSync(p)) throw new Error(`missing ${p}, rasterise first`);
    return { size, data: readFileSync(p) };
  });
  writeFileSync('public/favicon.ico', buildIco(parts));
  writeFileSync('public/site.webmanifest', `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync('public/assets/icons/favicon.svg', svg());
  console.log('wrote favicon.ico, site.webmanifest, favicon.svg');
} else {
  throw new Error(`unknown mode ${mode}`);
}
