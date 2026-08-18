import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCanonical,
  collectAliases,
  resolvePlanNames,
  styleRank,
  repairTechnicalName,
  normaliseForCompare,
} from '../src/ingest/canonical-names.mjs';

const observation = (technicalName, friendlyName, source = 'csv', extra = {}) => ({
  technicalName,
  friendlyName,
  source,
  ...extra,
});

test('prefers a name both sources agree on', () => {
  const chosen = pickCanonical(
    [
      { name: 'Only Csv', count: 9, sources: ['csv'] },
      { name: 'Both Agree', count: 2, sources: ['csv', 'md'] },
    ],
    { kind: 'friendly' }
  );
  assert.equal(chosen, 'Both Agree');
});

test('prefers Title Case over ALL CAPS for a friendly name', () => {
  const chosen = pickCanonical(
    [
      { name: 'EXCHANGE FOUNDATION', count: 5, sources: ['csv'] },
      { name: 'Exchange Foundation', count: 5, sources: ['csv'] },
    ],
    { kind: 'friendly' }
  );
  assert.equal(chosen, 'Exchange Foundation');
});

test('prefers the underscore form for a technical name', () => {
  const chosen = pickCanonical(
    [
      { name: 'Exchange Foundation', count: 5, sources: ['csv'] },
      { name: 'EXCHANGE_S_FOUNDATION', count: 1, sources: ['csv'] },
    ],
    { kind: 'technical' }
  );
  assert.equal(chosen, 'EXCHANGE_S_FOUNDATION');
});

// The ordering bug this test exists to prevent: the CSV is the naming
// authority, but it carries export defects, and a malformed preferred-source
// name must never beat a clean name from the other file.
test('structural quality outranks source precedence', () => {
  const chosen = pickCanonical(
    [
      { name: 'EXCHANGE_S_FOUNDATION PBI_PREMIUM_EM1_ADDON', count: 1, sources: ['csv'] },
      { name: 'PBI_PREMIUM_EM1_ADDON', count: 1, sources: ['md'] },
    ],
    { kind: 'technical', preferredSource: 'csv' }
  );
  assert.equal(chosen, 'PBI_PREMIUM_EM1_ADDON');
});

test('falls back to code-unit order when everything else ties', () => {
  const candidates = [
    { name: 'Bravo Name', count: 3, sources: ['csv'] },
    { name: 'Alpha Name', count: 3, sources: ['csv'] },
  ];
  assert.equal(pickCanonical(candidates, { kind: 'friendly' }), 'Alpha Name');
});

test('returns null for no usable candidates', () => {
  assert.equal(pickCanonical([], { kind: 'friendly' }), null);
  assert.equal(pickCanonical([{ name: '', count: 1 }], { kind: 'friendly' }), null);
});

test('styleRank puts whitespace-bearing technical names last', () => {
  assert.equal(styleRank('EXCHANGE_S_FOUNDATION', 'technical'), 0);
  assert.ok(styleRank('TWO NAMES FUSED', 'technical') > styleRank('Mixed_Case', 'technical'));
});

test('repairTechnicalName removes stray spaces beside underscores', () => {
  assert.deepEqual(repairTechnicalName('Auditing_10Year_ Retention_ Add_On'), {
    name: 'Auditing_10Year_Retention_Add_On',
    repaired: true,
  });
  assert.deepEqual(repairTechnicalName('DYN365_ ENTERPRISE _RELATIONSHIP_SALES'), {
    name: 'DYN365_ENTERPRISE_RELATIONSHIP_SALES',
    repaired: true,
  });
});

test('repairTechnicalName strips uninterpreted tab escapes', () => {
  assert.equal(repairTechnicalName('Virtualization \\tRights \\tfor \\tWindows').name, 'Virtualization Rights for Windows');
});

test('repairTechnicalName leaves a space not beside an underscore alone', () => {
  // This shape may be two fused names, which is for the ranking rule and the
  // validation gate to judge, not for a blind repair.
  assert.deepEqual(repairTechnicalName('EXCHANGE_S_FOUNDATION PBI_PREMIUM_EM1_ADDON'), {
    name: 'EXCHANGE_S_FOUNDATION PBI_PREMIUM_EM1_ADDON',
    repaired: false,
  });
});

test('resolves the Exchange Foundation case end to end', () => {
  const resolved = resolvePlanNames([
    observation('EXCHANGE_S_FOUNDATION', 'Exchange Foundation', 'csv'),
    observation('EXCHANGE_S_FOUNDATION', 'EXCHANGE FOUNDATION', 'md'),
    observation('EXCHANGE_S_FOUNDATION', 'EXCHANGE_S_FOUNDATION', 'md'),
  ]);
  assert.equal(resolved.technicalName, 'EXCHANGE_S_FOUNDATION');
  assert.equal(resolved.friendlyName, 'Exchange Foundation');
  assert.deepEqual(resolved.aliases.friendly, ['EXCHANGE FOUNDATION', 'EXCHANGE_S_FOUNDATION']);
});

test('never fabricates a friendly name when the source only repeats the technical one', () => {
  const resolved = resolvePlanNames([observation('SOME_PLAN', 'SOME_PLAN', 'csv')]);
  assert.equal(resolved.friendlyName, null);
});

// The regression that silently stripped a good heading from Windows 10 ESU.
test('keeps a Title Case rendering of an underscore technical name', () => {
  const resolved = resolvePlanNames([observation('WINDOWS_10_ESU_TENANT', 'Windows 10 ESU Tenant', 'md')]);
  assert.equal(resolved.technicalName, 'WINDOWS_10_ESU_TENANT');
  assert.equal(
    resolved.friendlyName,
    'Windows 10 ESU Tenant',
    'a readable casing of the technical name is a real friendly name, not a duplicate'
  );
});

test('drops a whitespace-bearing technical alias as an upstream defect', () => {
  const resolved = resolvePlanNames([
    observation('EXCHANGE_S_FOUNDATION PBI_PREMIUM_EM1_ADDON', 'Power BI Premium EM1', 'csv'),
    observation('PBI_PREMIUM_EM1_ADDON', 'Power BI Premium EM1', 'md'),
  ]);
  assert.equal(resolved.technicalName, 'PBI_PREMIUM_EM1_ADDON');
  assert.deepEqual(resolved.aliases.technical, []);
});

test('propagates the retired flag and the contributing sources', () => {
  const resolved = resolvePlanNames([
    observation('A_PLAN', 'A Plan', 'csv', { retiredUpstream: true }),
    observation('A_PLAN', 'A Plan', 'md'),
  ]);
  assert.equal(resolved.retiredUpstream, true);
  assert.deepEqual(resolved.sources, ['csv', 'md']);
});

// The single most valuable determinism guarantee in this module.
test('is input-order independent across 50 shuffled permutations', () => {
  const base = [
    observation('EXCHANGE_S_FOUNDATION', 'Exchange Foundation', 'csv'),
    observation('EXCHANGE_S_FOUNDATION', 'EXCHANGE FOUNDATION', 'md'),
    observation('EXCHANGE_FOUNDATION', 'Exchange Foundation', 'md'),
    observation('EXCHANGE_S_FOUNDATION', 'EXCHANGE_S_FOUNDATION', 'csv'),
  ];
  const expected = JSON.stringify(resolvePlanNames(base));

  for (let seed = 0; seed < 50; seed += 1) {
    // Deterministic shuffle: no Math.random, so a failure is reproducible.
    const shuffled = [...base].sort((a, b) => {
      const ka = (base.indexOf(a) * 7 + seed * 13) % 11;
      const kb = (base.indexOf(b) * 7 + seed * 13) % 11;
      return ka - kb;
    });
    assert.equal(JSON.stringify(resolvePlanNames(shuffled)), expected, `differed for seed ${seed}`);
  }
});

test('collectAliases deduplicates and sorts, excluding the chosen name', () => {
  const aliases = collectAliases(
    [{ name: 'B' }, { name: 'A' }, { name: 'A' }, { name: 'Chosen' }],
    'Chosen'
  );
  assert.deepEqual(aliases, ['A', 'B']);
});

test('normaliseForCompare treats case, spaces and underscores as noise', () => {
  assert.equal(normaliseForCompare('EXCHANGE_S_FOUNDATION'), 'exchange s foundation');
  assert.equal(normaliseForCompare('Exchange  S  Foundation'), 'exchange s foundation');
});
