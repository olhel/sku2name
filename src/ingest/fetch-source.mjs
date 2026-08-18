// Fetching the two upstream sources.
//
// Uses global fetch (Node 22+), so node-fetch is not a dependency. Conditional
// requests are the cheap no-change path: on the ~99% of days when nothing has
// changed upstream, a refresh costs two HEAD-sized round trips.

import { normalisedTextHash, sha256 } from '../lib/hash.mjs';

export const SOURCES = {
  markdown: {
    id: 'md',
    url: 'https://raw.githubusercontent.com/MicrosoftDocs/entra-docs/main/docs/identity/users/licensing-service-plan-reference.md',
    repo: 'MicrosoftDocs/entra-docs',
    path: 'docs/identity/users/licensing-service-plan-reference.md',
    ref: 'main',
    minBytes: 500_000,
    // Guards against a redirect, a CDN error page, or a truncated read
    // parsing into a plausible-looking empty dataset.
    mustContain: 'Service plans included (friendly names)',
  },
  csv: {
    id: 'csv',
    url: 'https://download.microsoft.com/download/e/3/e/e3e9faf2-f28b-490a-9ada-c6089a1fc5b0/Product%20names%20and%20service%20plan%20identifiers%20for%20licensing.csv',
    minBytes: 800_000,
    mustContain: 'Product_Display_Name,String_Id,GUID',
  },
};

export class SourceFetchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SourceFetchError';
    this.details = details;
  }
}

/**
 * Fetch one source with a conditional request.
 *
 * @param {object} source one of SOURCES
 * @param {{etag?: string|null, fetchImpl?: Function}} [options]
 * @returns {Promise<{status: number, changed: boolean, text?: string, etag?: string|null, bytes?: number, contentHash?: string, normalisedHash?: string}>}
 */
export async function fetchSource(source, { etag = null, fetchImpl = fetch } = {}) {
  const headers = { 'user-agent': 'sku2name-ingest (+https://sku2name.com)' };
  if (etag) headers['if-none-match'] = etag;

  const response = await fetchImpl(source.url, { headers, redirect: 'follow' });

  if (response.status === 304) {
    return { status: 304, changed: false, etag };
  }
  if (!response.ok) {
    throw new SourceFetchError(`${source.id}: HTTP ${response.status} fetching ${source.url}`, {
      status: response.status,
    });
  }

  const raw = await response.text();
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const bytes = Buffer.byteLength(raw, 'utf8');

  if (bytes < source.minBytes) {
    throw new SourceFetchError(
      `${source.id}: response is ${bytes} bytes, below the ${source.minBytes} minimum. Refusing to parse a probable error page.`,
      { bytes }
    );
  }
  if (source.mustContain && !text.includes(source.mustContain)) {
    throw new SourceFetchError(
      `${source.id}: response does not contain the expected marker ${JSON.stringify(source.mustContain)}. The upstream format may have changed.`,
      { bytes }
    );
  }

  return {
    status: response.status,
    changed: true,
    text,
    etag: response.headers.get('etag'),
    // The CSV's Last-Modified is demonstrably unreliable: it has read older
    // than the markdown while carrying newer SKUs. Recorded for humans, never
    // used as a freshness signal.
    lastModified: response.headers.get('last-modified'),
    bytes,
    contentHash: `sha256:${sha256(raw)}`,
    normalisedHash: `sha256:${normalisedTextHash(raw)}`,
  };
}

/**
 * Look up the commit that last touched the markdown file.
 *
 * Never fatal. The content hash is the authoritative dataset identity; the SHA
 * is a convenience for tracing a change back to a Microsoft pull request.
 * Unauthenticated GitHub API calls are rate limited to 60/hour per IP, which
 * is fine for a daily job and flaky during local development.
 */
export async function fetchCommitInfo(source, { token = null, fetchImpl = fetch } = {}) {
  if (!source.repo) return null;
  const url = `https://api.github.com/repos/${source.repo}/commits?path=${encodeURIComponent(source.path)}&sha=${source.ref}&per_page=1`;
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'sku2name-ingest (+https://sku2name.com)',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) return null;
    const commits = await response.json();
    if (!Array.isArray(commits) || commits.length === 0) return null;
    return {
      sha: commits[0].sha,
      date: commits[0].commit?.committer?.date || null,
      source: 'github-api',
    };
  } catch {
    return null;
  }
}
