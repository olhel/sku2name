// Stylesheet post-processing.

/**
 * Strip comments and blank lines from CSS.
 *
 * The stylesheet is heavily commented on purpose: several rules exist to work
 * around specific quirks in Microsoft's data, and the reason is not guessable
 * from the rule. Those explanations matter to whoever changes the file next
 * and matter not at all to a browser, so they are removed on the way out
 * rather than left out of the source.
 *
 * Deliberately not a minifier. It does not touch selectors, whitespace inside
 * declarations, or anything else that could change behavior; compression at
 * the edge already handles the rest.
 */
export function stripCssComments(text) {
  let out = '';
  let index = 0;

  while (index < text.length) {
    const start = text.indexOf('/*', index);
    if (start === -1) {
      out += text.slice(index);
      break;
    }
    out += text.slice(index, start);
    const end = text.indexOf('*/', start + 2);
    if (end === -1) break; // Unterminated comment: drop the remainder.
    index = end + 2;
  }

  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .filter((line) => line !== '')
    .join('\n');
}
