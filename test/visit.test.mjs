import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUserAgent } from '../src/lib/bots.mjs';
import {
  visitRecord,
  visitorHash,
  dailySalt,
  cleanReferer,
  isLoggablePath,
} from '../src/lib/visit.mjs';

const NOW = new Date('2026-08-19T10:00:00Z');
const base = {
  path: '/sku/enterprisepack',
  status: 200,
  durationMs: 3,
  referer: null,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36',
  country: 'NO',
  ip: '203.0.113.7',
  secret: 'test-salt',
  now: NOW,
};

/* ---------- what must never be logged ---------- */

test('a query string never reaches the record', () => {
  // /about/ promises that what you search for is never sent anywhere, and
  // /?q= does reach the server on a shared link.
  const record = visitRecord({ ...base, path: '/?q=SPE_E5' });
  assert.equal(record.path, '/');
  assert.ok(!JSON.stringify(record).includes('SPE_E5'));
});

test('the IP is used but never written', () => {
  const record = visitRecord(base);
  assert.ok(!JSON.stringify(record).includes('203.0.113.7'));
  assert.ok(record.visitor, 'it is still used to derive the visitor hash');
});

test('a referer keeps its origin and path but loses its query', () => {
  assert.equal(
    cleanReferer('https://www.google.com/search?q=office+365+e3&hl=en'),
    'https://www.google.com/search'
  );
  assert.equal(cleanReferer('https://example.com/'), 'https://example.com');
  assert.equal(cleanReferer('not a url'), null);
  assert.equal(cleanReferer(null), null);
});

/* ---------- the visitor hash ---------- */

test('the same visitor hashes the same way within a day', () => {
  const a = visitorHash({ secret: 's', ip: '1.2.3.4', userAgent: 'x', now: NOW });
  const b = visitorHash({ secret: 's', ip: '1.2.3.4', userAgent: 'x', now: new Date('2026-08-19T23:59:00Z') });
  assert.equal(a, b);
});

test('and differently tomorrow, so nobody can be followed across days', () => {
  const today = visitorHash({ secret: 's', ip: '1.2.3.4', userAgent: 'x', now: NOW });
  const tomorrow = visitorHash({ secret: 's', ip: '1.2.3.4', userAgent: 'x', now: new Date('2026-08-20T00:00:01Z') });
  assert.notEqual(today, tomorrow);
});

test('different visitors hash differently', () => {
  const a = visitorHash({ secret: 's', ip: '1.2.3.4', userAgent: 'x', now: NOW });
  const b = visitorHash({ secret: 's', ip: '5.6.7.8', userAgent: 'x', now: NOW });
  assert.notEqual(a, b);
});

test('the salt is derived, not random, because four replicas must agree', () => {
  assert.equal(dailySalt('secret', NOW), dailySalt('secret', new Date('2026-08-19T22:00:00Z')));
  assert.notEqual(dailySalt('secret', NOW), dailySalt('other', NOW));
});

test('no secret means no hash, rather than one shared hash for everyone', () => {
  assert.equal(visitorHash({ secret: null, ip: '1.2.3.4', userAgent: 'x', now: NOW }), null);
  const record = visitRecord({ ...base, secret: null });
  assert.equal(record.visitor, null);
  assert.equal(record.path, '/sku/enterprisepack', 'the rest is still logged');
});

test('the hash cannot be read back as an IP', () => {
  const hash = visitorHash({ secret: 's', ip: '203.0.113.7', userAgent: 'x', now: NOW });
  assert.match(hash, /^[0-9a-f]{16}$/);
  assert.ok(!hash.includes('203'));
});

/* ---------- what is skipped ---------- */

test('health polls and assets are not page views', () => {
  assert.equal(isLoggablePath('/healthz'), false, 'the deploy job polls this ~30 times per release');
  assert.equal(isLoggablePath('/assets/styles.abc123.css'), false);
  assert.equal(isLoggablePath('/s/idx.abc.json'), false);
  assert.equal(isLoggablePath('/sku/spe_e5'), true);
  assert.equal(isLoggablePath('/'), true);
});

/* ---------- bot classification ---------- */

test('names the crawlers worth naming', () => {
  const cases = [
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'googlebot'],
    ['Mozilla/5.0 (compatible; bingbot/2.0)', 'bingbot'],
    ['Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)', 'gptbot'],
    ['Mozilla/5.0 (compatible; OAI-SearchBot/1.0)', 'oai-searchbot'],
    ['Mozilla/5.0 (compatible; ClaudeBot/1.0)', 'claudebot'],
  ];
  for (const [ua, kind] of cases) {
    const out = classifyUserAgent(ua);
    assert.equal(out.isBot, true, ua);
    assert.equal(out.botKind, kind, ua);
  }
});

test('catches the crawlers sub2tenant was counting as human', () => {
  // Taken verbatim from 30 days of its real traffic.
  const missed = [
    'tenant-osint/1.0 (https://login.microsoftonline.com)',
    'python/3.11 aiohttp/3.12.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; Yeti/1.1; +https://naver.me/spd) Chrome/149.0.0.0 Safari/537.36',
    'duckassistbot/1.2; (+http://duckduckgo.com/duckassistbot.html)',
  ];
  for (const ua of missed) {
    assert.equal(classifyUserAgent(ua).isBot, true, ua.slice(0, 50));
  }
});

test('a plain "bot" substring does not false-positive on real browsers', () => {
  // This is the risky half of the fix: \bbot\b would miss "applebot", so the
  // match has to be a plain substring, which makes false positives the thing
  // to guard.
  const browsers = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0',
  ];
  for (const ua of browsers) {
    assert.equal(classifyUserAgent(ua).isBot, false, ua.slice(0, 60));
  }
});

test('a missing user-agent counts as a bot', () => {
  assert.equal(classifyUserAgent('').isBot, true);
  assert.equal(classifyUserAgent(null).botKind, 'no-user-agent');
});

/* ---------- the record itself ---------- */

test('the record carries what the queries need', () => {
  const record = visitRecord({ ...base, referer: 'https://www.bing.com/search?q=spe_e5' });
  assert.deepEqual(Object.keys(record).sort(), [
    'botKind', 'country', 'durationMs', 'isBot', 'kind',
    'path', 'referer', 'status', 'ts', 'userAgent', 'visitor',
  ]);
  assert.equal(record.country, 'NO');
  assert.equal(record.status, 200);
  assert.equal(record.referer, 'https://www.bing.com/search');
  assert.equal(record.isBot, false);
});

test('serialises to a single line, since one line is one log record', () => {
  const line = JSON.stringify(visitRecord(base));
  assert.ok(!line.includes('\n'));
  assert.deepEqual(JSON.parse(line).path, '/sku/enterprisepack');
});

// Regression: these four were logged as human in production on 19-20 August
// 2026. GoogleOther alone reached 1,374 pages in one night while being counted
// as a person, which made the human/bot split in the logs meaningless.
test('catches the crawlers production logged as human', () => {
  const cases = [
    [
      'GoogleOther',
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.137 Mobile Safari/537.36 (compatible; GoogleOther)',
      'googleother',
    ],
    [
      'heritrix',
      'Mozilla/5.0 (compatible; heritrix/3.14.2-SNAPSHOT-2026-04-13T06:21:22Z +https://www.image-meta.com)',
      null,
    ],
    ['Cloudflare-AgentReadiness', 'Mozilla/5.0 (compatible; Cloudflare-AgentReadiness/1.0)', null],
    [
      'a research scanner naming its institution',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko, Yokohama Institute of Information Security  https://www.iisec.ac.jp) Chrome/124.0.0.0 Safari/537.36',
      'self-identified-crawler',
    ],
  ];
  for (const [label, ua, expectedKind] of cases) {
    const out = classifyUserAgent(ua);
    assert.equal(out.isBot, true, label);
    if (expectedKind) assert.equal(out.botKind, expectedKind, label);
  }
});

// GoogleOther is the reason the name list alone is not enough: it contains
// neither "googlebot" nor the bare substring "bot".
test('GoogleOther would not be caught by the bot substring alone', () => {
  const ua = 'mozilla/5.0 (compatible; googleother)';
  assert.ok(!ua.includes('bot'), 'the premise: there is no "bot" in this string');
  assert.equal(classifyUserAgent(ua).isBot, true);
});

// The general rule behind the name list. A crawler that puts a contact URL in
// its agent is identifying itself; no shipping browser does that.
test('a user-agent carrying a URL is treated as a crawler', () => {
  assert.equal(
    classifyUserAgent('SomeNewCrawler/2.0 (+https://example.com/crawler)').botKind,
    'generic-bot',
    'this one also contains "crawler", so the named hint wins'
  );
  assert.equal(
    classifyUserAgent('Unnamed/1.0 (https://example.com/about)').botKind,
    'self-identified-crawler'
  );
  // And the rule must not fire on a browser, none of which carry a URL.
  assert.equal(
    classifyUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    ).isBot,
    false
  );
});
