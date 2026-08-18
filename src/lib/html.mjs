// HTML rendering primitives.
//
// Interpolations are escaped by default; composition requires an explicit
// raw(). Product names in this dataset contain ampersands, parentheses and
// slashes, so this is not a theoretical concern.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a value for interpolation into HTML text or an attribute value. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

class Raw {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** Mark a string as already-safe HTML so it is interpolated verbatim. */
export function raw(value) {
  return value instanceof Raw ? value : new Raw(String(value ?? ''));
}

export function isRaw(value) {
  return value instanceof Raw;
}

function interpolate(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join('');
  return esc(value);
}

/** Tagged template that escapes interpolations and returns a Raw result. */
export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) out += interpolate(values[i]);
  }
  return raw(out);
}

// Inside a <script> block, HTML escaping does not apply: the only thing that
// can terminate the element early is the literal sequence "</script". These
// are JSON unicode escapes, which are valid JSON and mean the same string to
// any parser, while being inert to the HTML tokenizer.
//
// Written as explicit escape sequences. A single missing backslash here turns
// the whole replacement into a silent no-op that reading will not catch, which
// is exactly what happened the first time this was written.
const JSON_LD_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
};

/** Serialise an object as a JSON-LD script block that cannot break out of it. */
export function jsonLd(data) {
  const json = JSON.stringify(data, null, 2).replace(/[<>&]/g, (char) => JSON_LD_ESCAPES[char]);
  return raw(`<script type="application/ld+json">\n${json}\n</script>`);
}
