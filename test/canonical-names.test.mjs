import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCanonical,
  collectAliases,
  resolvePlanNames,
  styleRank,
  repairTechnicalName,
  normaliseForCompare,
  bracketRank,
  deletedText,
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

/* ---------- damaged names, taken from the live sources ---------- */

// Reported from the live site: /sku/dyn365_enterprise_p1_iw read "Dynamics 365
// P1 Tria for Information Workers" and /sku/business_voice read "Microsoft 365
// Business Voice (UK". Both are Microsoft's CSV verbatim, both are correct in
// Microsoft's markdown, and the CSV wins on name precedence.

test('a name whose brackets do not close loses to one that closes them', () => {
  const candidates = [
    { name: 'Microsoft 365 Business Voice (UK', count: 1, sources: ['csv'] },
    { name: 'Microsoft 365 Business Voice (UK)', count: 1, sources: ['md'] },
  ];
  assert.equal(
    pickCanonical(candidates, { kind: 'product' }),
    'Microsoft 365 Business Voice (UK)',
    'even though the truncated one comes from the preferred source'
  );
});

test('the bracket rule runs in both directions, because the defect does', () => {
  // RMS_S_ENTERPRISE) is the markdown's own unbalanced name, so this cannot be
  // written as "prefer the markdown" or as "prefer the longer name".
  assert.equal(bracketRank('RMS_S_ENTERPRISE)'), 1);
  assert.equal(bracketRank('RMS_S_ENTERPRISE'), 0);
  assert.equal(bracketRank('Microsoft 365 Business Voice (UK'), 1);
  assert.equal(bracketRank('Microsoft Application Protection and Governance (A)'), 0);
});

test('a name missing characters loses to the same name with them', () => {
  const candidates = [
    { name: 'Dynamics 365 P1 Tria for Information Workers', count: 2, sources: ['csv'] },
    { name: 'Dynamics 365 P1 Trial for Information Workers', count: 1, sources: ['md'] },
  ];
  assert.equal(
    pickCanonical(candidates, { kind: 'product' }),
    'Dynamics 365 P1 Trial for Information Workers',
    'despite the truncated spelling being both preferred-source and more frequent'
  );
});

test('a comma dropped by the CSV export is treated the same way', () => {
  const candidates = [
    { name: 'Exchange Enterprise CAL Services (EOP DLP)', count: 1, sources: ['csv'] },
    { name: 'Exchange Enterprise CAL Services (EOP, DLP)', count: 1, sources: ['md'] },
  ];
  assert.equal(
    pickCanonical(candidates, { kind: 'product' }),
    'Exchange Enterprise CAL Services (EOP, DLP)'
  );
});

// The exception that keeps the rule from doing harm. Both of these are real,
// and in both the shorter name is the one to publish.
test('an internal underscore suffix is not treated as a truncation', () => {
  assert.equal(
    pickCanonical(
      [
        { name: 'Dynamics 365 Team Members', count: 1, sources: ['csv'] },
        { name: 'Dynamics 365 Team Members_wDynamicsRetail', count: 1, sources: ['md'] },
      ],
      { kind: 'product' }
    ),
    'Dynamics 365 Team Members'
  );
  assert.equal(
    pickCanonical(
      [
        { name: 'Microsoft Teams Phone Standard_USGOV_DOD', count: 1, sources: ['csv'] },
        { name: 'Microsoft Teams Phone Standard_System_USGOV_DOD', count: 1, sources: ['md'] },
      ],
      { kind: 'product' }
    ),
    'Microsoft Teams Phone Standard_USGOV_DOD'
  );
});

test('deletedText reports what the shorter name is missing, or null', () => {
  assert.equal(deletedText('(UK', '(UK)'), ')');
  assert.equal(deletedText('Tria', 'Trial'), 'l');
  assert.equal(deletedText('PowerApps', 'Power Apps'), ' ');
  assert.equal(deletedText('Members', 'Members_wRetail'), '_wRetail');
  // Not a deletion: the characters differ rather than being absent.
  assert.equal(deletedText('Microsoft Entra Basic', 'Microsoft Entra ID Basic'), 'ID ');
  assert.equal(deletedText('Exchange Online (Plan 2)', 'Exchange Online (PLAN 2)'), null);
  assert.equal(deletedText('same', 'same'), null, 'equal length is not a deletion');
});

test('the correct spelling survives as an alias either way', () => {
  const candidates = [
    { name: 'Microsoft 365 Business Voice (UK', count: 1, sources: ['csv'] },
    { name: 'Microsoft 365 Business Voice (UK)', count: 1, sources: ['md'] },
  ];
  const chosen = pickCanonical(candidates, { kind: 'product' });
  assert.deepEqual(collectAliases(candidates, chosen), ['Microsoft 365 Business Voice (UK']);
});

// Regression, caught by running the real ingest rather than by the unit tests.
// The stray-space defect makes the clean technical name look like the truncated
// one, so a whitespace-only difference must not count as missing content.
test('a stray-space defect does not make the clean name look truncated', () => {
  const candidates = [
    { name: 'DYN365_ENTERPRISE_RELATIONSHIP_SALES', count: 1, sources: ['csv'] },
    { name: 'DYN365_ ENTERPRISE _RELATIONSHIP_SALES', count: 1, sources: ['md'] },
  ];
  assert.equal(
    pickCanonical(candidates, { kind: 'technical' }),
    'DYN365_ENTERPRISE_RELATIONSHIP_SALES'
  );
});

test('spacing alone is a style difference, not damage', () => {
  // Both spellings are Microsoft's and neither is missing content, so this is
  // left to styleRank and frequency rather than being forced by the truncation
  // rank. The point is only that the rank does not fire.
  assert.equal(deletedText('PowerApps', 'Power Apps'), ' ', 'it is still a deletion');
  const candidates = [
    { name: 'PowerApps Plan 1 for Government', count: 1, sources: ['csv'] },
    { name: 'Power Apps Plan 1 for Government', count: 1, sources: ['md'] },
  ];
  assert.equal(
    pickCanonical(candidates, { kind: 'product' }),
    'PowerApps Plan 1 for Government',
    'the preferred source decides, as it did before'
  );
});

// Regressions, all three caught by running the real ingest rather than by the
// unit tests. A plain "one name is the other with characters deleted" rule
// rewrote 20 correct names on the live site before these guards existed.

test('a whole word added or removed is a rename, not a truncation', () => {
  // "RETIRED - " is stripped into a flag during ingest, so it must never be
  // able to win a display name back.
  assert.equal(
    pickCanonical(
      [
        { name: 'Places Core', count: 1, sources: ['csv'] },
        { name: 'RETIRED - Places Core', count: 1, sources: ['md'] },
      ],
      { kind: 'friendly' }
    ),
    'Places Core'
  );
  // "P1" abbreviates "Plan 1". Treating that as damage handed the page to a
  // retired brand name.
  assert.equal(
    pickCanonical(
      [
        { name: 'Microsoft Entra ID P1', count: 2, sources: ['csv'] },
        { name: 'Microsoft Entra ID Plan 1', count: 1, sources: ['md'] },
        { name: 'Azure Active Directory Premium Plan 1', count: 1, sources: ['md'] },
      ],
      { kind: 'friendly' }
    ),
    'Microsoft Entra ID P1'
  );
  // Microsoft dropped "Online" from the SharePoint plan names.
  assert.equal(
    pickCanonical(
      [
        { name: 'SharePoint (Plan 2)', count: 2, sources: ['csv'] },
        { name: 'SharePoint Online (Plan 2)', count: 1, sources: ['md'] },
      ],
      { kind: 'friendly' }
    ),
    'SharePoint (Plan 2)'
  );
});

test('a damaged name is not evidence that a clean one is truncated', () => {
  // Content_Explorer verbatim. "Analytics - Premium" is "Analytics - Premium)"
  // with a character deleted, so without the bracket check the clean name is
  // demoted for lacking the defect and the en dash spelling wins the page.
  const candidates = [
    { name: 'Information Protection and Governance Analytics - Premium', count: 2, sources: ['csv'] },
    { name: 'Information Protection and Governance Analytics - Premium)', count: 1, sources: ['md'] },
    { name: 'Information Protection and Governance Analytics – Premium', count: 1, sources: ['md'] },
  ];
  assert.equal(
    pickCanonical(candidates, { kind: 'friendly' }),
    'Information Protection and Governance Analytics - Premium'
  );
});

test('finds the truncations the report did not mention', () => {
  // All three are live in Microsoft's CSV today and were published as-is.
  const cases = [
    ['Power BI Premium P', 'Power BI Premium P1'],
    ['MICROSOFT DYNAMICS CRM ONLINE PROFESSIONA', 'MICROSOFT DYNAMICS CRM ONLINE PROFESSIONAL'],
    ['Dataverse for Cust Insights BASE', 'Dataverse for Customer Insights BASE'],
  ];
  for (const [truncated, complete] of cases) {
    assert.equal(
      pickCanonical(
        [
          { name: truncated, count: 2, sources: ['csv'] },
          { name: complete, count: 1, sources: ['md'] },
        ],
        { kind: 'friendly' }
      ),
      complete,
      truncated
    );
  }
});
