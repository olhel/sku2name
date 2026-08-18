import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows, parseCsvTable } from '../src/ingest/csv.mjs';
import { fixture } from './helpers.mjs';

test('splits plain rows and cells', () => {
  assert.deepEqual(parseCsvRows('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('preserves a comma inside a quoted field', () => {
  assert.deepEqual(parseCsvRows('"Dynamics 365, Enterprise",X\n'), [['Dynamics 365, Enterprise', 'X']]);
});

test('unescapes a doubled quote inside a quoted field', () => {
  assert.deepEqual(parseCsvRows('"say ""hi""",X\n'), [['say "hi"', 'X']]);
});

test('preserves a newline inside a quoted field', () => {
  assert.deepEqual(parseCsvRows('"line1\nline2",X\n'), [['line1\nline2', 'X']]);
});

test('handles CRLF line endings', () => {
  const rows = parseCsvTable(fixture('quirks', 'csv-crlf.csv')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].values.String_Id, 'ENTERPRISEPACK');
  assert.ok(!rows[0].values.Service_Plans_Included_Friendly_Names.includes('\r'));
});

test('preserves an empty interior cell', () => {
  assert.deepEqual(parseCsvRows('a,,c\n'), [['a', '', 'c']]);
});

test('drops a trailing blank line rather than emitting an empty row', () => {
  assert.deepEqual(parseCsvRows('a,b\n\n'), [['a', 'b']]);
});

test('strips a UTF-8 BOM', () => {
  assert.deepEqual(parseCsvRows('﻿a,b\n'), [['a', 'b']]);
});

test('reports a 1-indexed line number that matches an editor', () => {
  const { rows } = parseCsvTable('h1,h2\nv1,v2\nv3,v4\n');
  assert.deepEqual(rows.map((r) => r.line), [2, 3]);
});
