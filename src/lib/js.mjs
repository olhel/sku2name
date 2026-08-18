// Client script post-processing.
//
// The same argument as stripCssComments: the client scripts are heavily
// commented because several rules exist for reasons that are not guessable
// from the code, and those explanations matter to whoever changes the file
// next and matter not at all to a browser. CSS already had this treatment;
// JS shipped every byte of it, which cost more than everything else in the
// bundle put together.
//
// Deliberately not a minifier. It removes comments and the blank lines they
// leave behind, and touches nothing else.
//
// A line filter cannot do this safely: "//" appears inside string and template
// literals, and "/" opens a regex literal whose body can contain both "//" and
// "/*". So this walks the source one character at a time and tracks which
// construct it is inside.

/**
 * Whether a `/` at this point opens a regex literal rather than being
 * division. The standard heuristic: division can only follow a value, so if
 * the last meaningful character closed one, the slash is an operator.
 *
 * @param {string} text
 * @param {number} index position of the slash
 */
function opensRegex(text, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i -= 1;
  if (i < 0) return true;
  const previous = text[i];
  // A close bracket, identifier character or number ends a value, so what
  // follows is division. Everything else (operators, commas, opening
  // brackets, `return`, ...) means a regex.
  if (previous === ')' || previous === ']' || previous === '}') return false;
  return !/[A-Za-z0-9_$]/.test(previous);
}

/**
 * Strip line and block comments from JavaScript source.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripJsComments(text) {
  let out = '';
  let i = 0;
  let inTemplate = false;
  // One brace-depth counter per open `${ ... }`. Code inside an interpolation
  // is ordinary code, so the loop leaves template mode for it and has to know
  // which `}` hands control back.
  const interpolations = [];

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (inTemplate) {
      if (c === '\\') {
        out += c + (next ?? '');
        i += 2;
        continue;
      }
      if (c === '$' && next === '{') {
        out += '${';
        i += 2;
        inTemplate = false;
        interpolations.push(0);
        continue;
      }
      if (c === '`') {
        out += c;
        i += 1;
        inTemplate = false;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }

    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') {
          out += text[i] + (text[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += text[i];
        if (text[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (c === '`') {
      out += c;
      i += 1;
      inTemplate = true;
      continue;
    }

    if (interpolations.length > 0 && c === '{') {
      interpolations[interpolations.length - 1] += 1;
      out += c;
      i += 1;
      continue;
    }

    if (interpolations.length > 0 && c === '}') {
      if (interpolations[interpolations.length - 1] === 0) {
        interpolations.pop();
        inTemplate = true;
      } else {
        interpolations[interpolations.length - 1] -= 1;
      }
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && opensRegex(text, i)) {
      out += c;
      i += 1;
      let inClass = false;
      while (i < text.length) {
        if (text[i] === '\\') {
          out += text[i] + (text[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (text[i] === '[') inClass = true;
        else if (text[i] === ']') inClass = false;
        // A slash inside [...] is a literal, not the terminator.
        else if (text[i] === '/' && !inClass) {
          out += '/';
          i += 1;
          break;
        }
        out += text[i];
        i += 1;
      }
      // Flags.
      while (i < text.length && /[a-z]/.test(text[i])) {
        out += text[i];
        i += 1;
      }
      continue;
    }

    out += c;
    i += 1;
  }

  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .filter((line) => line !== '')
    .join('\n');
}
