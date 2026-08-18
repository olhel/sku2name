import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Read a fixture file as UTF-8 text. */
export function fixture(...parts) {
  return readFileSync(join(here, 'fixtures', ...parts), 'utf8');
}
