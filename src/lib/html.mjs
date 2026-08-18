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

/** Serialise an object as a JSON-LD script block, escaping the `<` that could close it. */
export function jsonLd(data) {
  const json = JSON.stringify(data, null, 2).replace(/</g, '\u003c');
  return raw(`<script type="application/ld+json">\n${json}\n</script>`);
}
