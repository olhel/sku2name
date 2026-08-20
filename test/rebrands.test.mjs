import test from 'node:test';
import assert from 'node:assert/strict';
import { rebrandRank, REBRANDS } from '../src/ingest/rebrands.mjs';
import { pickCanonical } from '../src/ingest/canonical-names.mjs';

/* ---------- the rank ---------- */

test('a retired brand name loses when the current one is also published', () => {
  const cases = [
    ['Azure Active Directory', 'Microsoft Entra ID'],
    ['Azure Active Directory Basic for Education', 'Microsoft Entra ID Basic for Education'],
    ['Microsoft Teams Essentials (AAD Identity)', 'Microsoft Teams Essentials (Microsoft Entra identity)'],
    ['Flow Plan 1 for Government', 'Power Automate Plan 1 for Government (Qualified Offer)'],
    ['PowerApps Plan 1 for Government', 'Power Apps Plan 1 for Government'],
  ];
  for (const [retired, current] of cases) {
    const both = [retired, current];
    assert.equal(rebrandRank(retired, both), 1, retired);
    assert.equal(rebrandRank(current, both), 0, current);
  }
});

// The guard that makes a bare "flow" token safe. 21 published names contain the
// word, and most are Microsoft's current naming using it as a noun.
test('a name carrying the current brand is never stale, whatever else it says', () => {
  const names = ['Power Automate per flow plan'];
  assert.equal(rebrandRank('Power Automate per flow plan', names), 0);
  assert.equal(
    rebrandRank('Common data service for Flow per business process plan', [
      'Common data service for Flow per business process plan',
      'Common data service for Power Automate per business process plan',
    ]),
    1,
    'but it is stale when a Power Automate spelling of the same plan exists'
  );
});

// Nothing is invented. If Microsoft never published a current name for a
// product, the retired one still wins and the page is not wrong.
test('a retired name with no current sibling is left alone', () => {
  for (const name of ['Flow Free', 'Flow for Developer', 'PowerApps Trial', 'Azure Active Directory Premium P2']) {
    assert.equal(rebrandRank(name, [name]), 0, name);
  }
});

/* ---------- how it ranks against the other rules ---------- */

test('readability still outranks brand currency', () => {
  // ALL CAPS is a defect on every page; a retired brand is stale content. The
  // ordering is deliberate, so this pins it.
  assert.equal(
    pickCanonical(
      [
        { name: 'Azure Active Directory Premium P1', count: 1, sources: ['csv'] },
        { name: 'MICROSOFT ENTRA ID P1', count: 1, sources: ['md'] },
      ],
      { kind: 'friendly' }
    ),
    'Azure Active Directory Premium P1'
  );
});

test('brand currency outranks which file the name came from', () => {
  // The whole point. The retired name sits in whichever file was regenerated
  // last, so provenance must not settle it. Here the CSV is the preferred
  // source and still loses.
  assert.equal(
    pickCanonical(
      [
        { name: 'Flow Plan 1 for Government', count: 2, sources: ['csv'] },
        { name: 'Power Automate Plan 1 for Government', count: 1, sources: ['md'] },
      ],
      { kind: 'product' }
    ),
    'Power Automate Plan 1 for Government'
  );
  // And the reverse, which is why a source preference could not have done this
  // job: on POWERAPPS_DEV the retired spelling is the markdown's.
  assert.equal(
    pickCanonical(
      [
        { name: 'Microsoft Power Apps for Developer', count: 1, sources: ['csv'] },
        { name: 'Microsoft PowerApps for Developer', count: 2, sources: ['md'] },
      ],
      { kind: 'product' }
    ),
    'Microsoft Power Apps for Developer'
  );
});

test('every entry names a rename that only runs one way', () => {
  for (const { retired, current } of REBRANDS) {
    assert.ok(retired instanceof RegExp && current instanceof RegExp);
    // A rule whose two sides can match the same string would demote a name
    // against itself.
    assert.notEqual(String(retired), String(current));
  }
});
