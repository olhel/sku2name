// Client search indexes.
//
// Key decision: GUIDs are NOT in the main index. A GUID lookup is a
// navigation, and /id/<guid> already handles it on the server. Keeping 1,400
// near-incompressible hex strings out of the payload saves roughly 50 KB on
// every homepage visit, for a case that is a redirect anyway.
//
// The main index is columnar rather than an array of objects: no repeated
// keys, better compression, faster JSON.parse.

import { compactStringify } from '../lib/stable-json.mjs';
import { planHeading } from './page-plan.mjs';

export const GUID_PREFIX_LENGTH = 16;

/**
 * @returns {{main: string, guid: string, stats: object}}
 */
export function buildSearchIndexes({ skus, servicePlans, reverse }) {
  const sku = { id: [], n: [], s: [], c: [], a: {} };
  const plan = { id: [], n: [], s: [], c: [], a: {} };

  skus.forEach((record, index) => {
    sku.id.push(record.stringId || '');
    // An empty name means "same as the id"; the client substitutes it back.
    // Saves a couple of KB and encodes the degenerate case explicitly.
    sku.n.push(record.productName === record.stringId ? '' : record.productName || '');
    sku.s.push(record.slug);
    sku.c.push(record.servicePlanIds.length);
    const aliases = [...(record.aliases?.productName || []), ...(record.aliases?.stringId || [])];
    if (aliases.length) sku.a[index] = aliases;
  });

  servicePlans.forEach((record, index) => {
    const heading = planHeading(record);
    plan.id.push(record.technicalName || '');
    plan.n.push(heading === record.technicalName ? '' : heading || '');
    plan.s.push(record.slug);
    plan.c.push((reverse.get(record.planId) || []).length);
    const aliases = [...(record.aliases?.friendly || []), ...(record.aliases?.technical || [])];
    if (aliases.length) plan.a[index] = aliases;
  });

  const main = compactStringify({ v: 1, sku, sp: plan });

  // Dash-stripped hex prefixes plus a slug, fetched only once someone has
  // typed enough hex to mean it.
  //
  // Only the first GUID_PREFIX_LENGTH characters are shipped. This index only
  // ever serves PARTIAL GUIDs: a complete one is a navigation and goes to the
  // /id/ route on the server instead. Sixteen hex characters discriminate
  // 1,400 entries with enormous margin, and hex is incompressible, so the
  // second half of every GUID would be pure dead weight.
  //
  // The path prefix is a per-type flag rather than a repeated string, since
  // "/service-plan/" written 800 times is 11 KB of pure repetition.
  const guidKeys = [];
  const guidSlugs = [];
  const guidTypes = [];
  skus.forEach((record) => {
    guidKeys.push(record.skuId.replace(/-/g, '').slice(0, GUID_PREFIX_LENGTH));
    guidSlugs.push(record.slug);
    guidTypes.push(0);
  });
  servicePlans.forEach((record) => {
    guidKeys.push(record.planId.replace(/-/g, '').slice(0, GUID_PREFIX_LENGTH));
    guidSlugs.push(record.slug);
    guidTypes.push(1);
  });

  const order = guidKeys.map((key, index) => index).sort((a, b) => (guidKeys[a] < guidKeys[b] ? -1 : 1));
  const guid = compactStringify({
    v: 1,
    // Keys are truncated to this many hex characters.
    len: GUID_PREFIX_LENGTH,
    // Index 0 is a SKU, index 1 is a service plan.
    p: ['/sku/', '/service-plan/'],
    k: order.map((index) => guidKeys[index]),
    s: order.map((index) => guidSlugs[index]),
    y: order.map((index) => guidTypes[index]),
  });

  return {
    main,
    guid,
    stats: { mainBytes: Buffer.byteLength(main), guidBytes: Buffer.byteLength(guid) },
  };
}
