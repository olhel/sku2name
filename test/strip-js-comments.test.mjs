import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripJsComments } from '../src/lib/js.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('removes line and block comments', () => {
  // The space before the comment goes with it: trailing whitespace is trimmed.
  assert.equal(stripJsComments('const a = 1; // trailing'), 'const a = 1;');
  assert.equal(stripJsComments('/* leading */const a = 1;'), 'const a = 1;');
  assert.equal(stripJsComments('a;\n// whole line\nb;'), 'a;\nb;');
});

test('leaves comment-like text inside strings alone', () => {
  for (const source of [
    `const a = 'https://example.com';`,
    `const a = "// not a comment";`,
    `const a = '/* not a comment */';`,
    'const a = `//${x}//`;',
  ]) {
    assert.equal(stripJsComments(source), source, source);
  }
});

test('leaves slashes inside regex literals alone', () => {
  // The character class in the real scorer contains no slash, but the URL
  // splitters elsewhere do, and a naive stripper eats the rest of the file.
  for (const source of [
    String.raw`const re = /a\/b/;`,
    String.raw`const re = /[/]/g;`,
    String.raw`const re = /[^/]+/g;`,
    String.raw`const re = /^(?:urn:uuid:)?[{(]?([0-9a-f]{8})/i;`,
    String.raw`const a = value.replace(/-/g, '');`,
  ]) {
    assert.equal(stripJsComments(source), source, source);
  }
});

test('does not mistake division for a regex', () => {
  const source = 'const a = (b + c) / d; const e = f[0] / 2; const g = h / 3;';
  assert.equal(stripJsComments(source), source);
});

test('handles interpolations that contain strings and slashes', () => {
  const source = 'const a = `/id/${dashed(g)}/x`;';
  assert.equal(stripJsComments(source), source);
});

test('every shipped client script still parses after stripping', async () => {
  const dir = join(ROOT, 'src/client');
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(join(dir, name), 'utf8');
    const stripped = stripJsComments(source);
    // new Function throws on a syntax error, which is what a broken strip
    // produces. It never runs the body.
    assert.doesNotThrow(() => new Function(stripped), `${name} failed to parse after stripping`);
    assert.ok(stripped.length < source.length, `${name} lost nothing`);
  }
});

test('is idempotent', async () => {
  const source = await readFile(join(ROOT, 'src/client/search.js'), 'utf8');
  const once = stripJsComments(source);
  assert.equal(stripJsComments(once), once);
});
