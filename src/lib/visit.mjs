// Building the one JSON line written per page view.
//
// Container Apps forwards stdout to the Log Analytics workspace, so a
// console.log here is the whole transport.
//
// Three things are deliberately absent, each because the site makes a public
// promise on /about/:
//
//   The query string. "/?q=SPE_E5" reaches the server when someone opens a
//   shared search link, and the About page says what you search for is never
//   sent anywhere. Only the path is recorded, and visitRecord takes a path
//   rather than a URL so a query string cannot arrive here by accident.
//
//   The IP. It is needed to derive the visitor hash and is never written.
//
//   Any stored identifier. sub2tenant keeps a UUID in localStorage; ePrivacy
//   covers storing information on a visitor's device whatever the mechanism,
//   and analytics is not strictly necessary, so that would need consent. The
//   About page also says no cookies are set.

import { createHash } from 'node:crypto';
import { classifyUserAgent } from './bots.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * The salt rotates at midnight UTC, so the same visitor is a different hash
 * tomorrow and cannot be followed across days.
 *
 * It is derived rather than random because the app scales to four replicas.
 * A per-replica random salt would hash one visitor four different ways and
 * inflate unique counts by up to 4x.
 */
export function dailySalt(secret, now) {
  return sha256(`${secret}:${now.toISOString().slice(0, 10)}`);
}

/**
 * A per-day pseudonym. Not reversible to an IP, and not linkable to yesterday.
 * Returns null when no secret is configured, so logging still works before the
 * secret exists rather than silently producing a constant hash for everyone.
 */
export function visitorHash({ secret, ip, userAgent, now }) {
  if (!secret || !ip) return null;
  return sha256(`${dailySalt(secret, now)}:${ip}:${userAgent || ''}:sku2name.com`).slice(0, 16);
}

/**
 * Referrers are kept for their origin and path only. A query string on someone
 * else's URL is not ours to store, and the useful signal is which site sent
 * the visitor.
 */
export function cleanReferer(referer) {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.origin}${url.pathname}`.replace(/\/$/, '') || url.origin;
  } catch {
    return null;
  }
}

/** Neither is a page view: one is the deploy health poll, the rest are assets. */
export function isLoggablePath(path) {
  if (!path || path === '/healthz') return false;
  return !path.startsWith('/assets/') && !path.startsWith('/s/');
}

/**
 * @param {object} input
 * @param {string} input.path  request path only, never a full URL
 * @returns {object} the record to serialise
 */
export function visitRecord({
  path,
  status,
  durationMs,
  referer,
  userAgent,
  country,
  ip,
  secret,
  now,
}) {
  const { isBot, botKind } = classifyUserAgent(userAgent);
  return {
    ts: now.toISOString(),
    kind: 'visit',
    // Defensive: visitRecord is the only place a query string could leak in,
    // and a guard here is cheaper than auditing every call site later.
    path: String(path).split('?')[0],
    status,
    durationMs,
    referer: cleanReferer(referer),
    country: country || null,
    userAgent: userAgent || null,
    isBot,
    botKind,
    visitor: visitorHash({ secret, ip, userAgent, now }),
  };
}
