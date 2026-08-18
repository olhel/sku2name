#!/usr/bin/env node
// Builds twice and asserts the output trees are byte-identical.
//
// This is the cheapest possible guard against an accidental Date.now(), an
// unsorted Object.keys, or a locale-dependent comparator creeping into a
// render path. Any of those would churn 1,400 pages on every deploy and make
// data diffs unreadable.

import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

async function hashTree() {
  const files = (await walk(DIST)).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.slice(DIST.length).split(sep).join('/'));
    hash.update(await readFile(file));
  }
  return { digest: hash.digest('hex'), count: files.length };
}

const build = () => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });

build();
const first = await hashTree();
build();
const second = await hashTree();

console.log(`build 1: ${first.digest}  (${first.count} files)`);
console.log(`build 2: ${second.digest}  (${second.count} files)`);

if (first.digest !== second.digest) {
  console.error('\nFAILED: two builds of the same data produced different output.');
  process.exit(1);
}
console.log('\nOK: the build is deterministic.');
