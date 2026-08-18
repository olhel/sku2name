import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCell, splitRow, isDelimiterRow, findTables } from '../src/ingest/markdown-tables.mjs';

test('splitRow drops one leading and one trailing pipe', () => {
  assert.deepEqual(splitRow('| a | b | c |'), ['a', 'b', 'c']);
});

test('splitRow preserves an empty interior cell', () => {
  assert.deepEqual(splitRow('| a |  | c |'), ['a', '', 'c']);
});

test('splitRow removes stray tabs inside cells', () => {
  assert.deepEqual(splitRow('| Stray Tabs Row |\tSTRAYTABS\t| x\t|'), ['Stray Tabs Row', 'STRAYTABS', 'x']);
});

test('splitRow does not split on an escaped pipe', () => {
  assert.deepEqual(splitRow('| a \\| b | c |'), ['a | b', 'c']);
});

test('cleanCell collapses non-breaking and zero-width whitespace', () => {
  assert.equal(cleanCell('a ​  b'), 'a b');
  assert.equal(cleanCell('  padded\t\tvalue  '), 'padded value');
});

test('isDelimiterRow recognises the alignment row and nothing else', () => {
  assert.ok(isDelimiterRow('| --- | --- |'));
  assert.ok(isDelimiterRow('|:---|---:|'));
  assert.ok(!isDelimiterRow('| a | b |'));
  assert.ok(!isDelimiterRow('plain prose'));
});

test('findTables requires a delimiter row directly under the header', () => {
  const withoutDelimiter = ['| a | b |', '| 1 | 2 |'];
  assert.equal(findTables(withoutDelimiter).length, 0);

  const withDelimiter = ['| a | b |', '| --- | --- |', '| 1 | 2 |'];
  assert.equal(findTables(withDelimiter).length, 1);
});

test('findTables stops at the first blank line', () => {
  const lines = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '', '| 3 | 4 |'];
  const [table] = findTables(lines);
  assert.equal(table.rows.length, 1);
});

test('findTables ignores a pipe appearing in prose', () => {
  const lines = ['Prose with a | pipe in it.', 'More prose.'];
  assert.equal(findTables(lines).length, 0);
});

test('findTables reports a 1-indexed source line for every row', () => {
  const lines = ['intro', '| a | b |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'];
  const [table] = findTables(lines);
  assert.deepEqual(table.rows.map((row) => row.line), [4, 5]);
});
