// User-agent classification, for telling crawler traffic from human traffic.
//
// Most of this site's traffic is expected to arrive from search, so bots are
// not noise to be filtered out. "Is Googlebot actually crawling all 1,428
// pages" is one of the questions the logs exist to answer, which is why the
// kind is recorded rather than just a boolean.
//
// Adapted from sub2tenant's classifier, with its main gap closed. That list
// checked for "crawler", "spider" and "crawl" but not plain "bot", so against
// sub2tenant's own 30 days of data these were all being counted as human:
//
//   tenant-osint/1.0        141 hits
//   python/3.11 aiohttp      77
//   applebot/0.1             10   (embedded inside a normal-looking Safari UA)
//   ahrefsbot, yeti, duckassistbot
//
// A word-boundary match does not fix it either: \bbot\b does not match
// "applebot" or "duckassistbot", because there is no boundary before "bot".
// It has to be a plain substring. That is safe in practice: no mainstream
// browser user-agent contains "bot", which the tests check explicitly.

/** Named first, so the log says which crawler rather than just "a bot". */
const NAMED_BOTS = [
  ['googlebot', 'googlebot'],
  // GoogleOther is Google's non-search crawler. It contains neither
  // "googlebot" nor even the substring "bot", and it reached 1,374 pages
  // here in one night while being counted as a human the whole time.
  ['googleother', 'googleother'],
  ['google-extended', 'google-extended'],
  ['storebot-google', 'googlebot'],
  ['bingbot', 'bingbot'],
  ['duckduckbot', 'duckduckbot'],
  ['duckassistbot', 'duckduckbot'],
  ['baiduspider', 'baiduspider'],
  ['yandexbot', 'yandexbot'],
  ['applebot', 'applebot'],
  ['amazonbot', 'amazonbot'],
  ['petalbot', 'petalbot'],
  ['yeti/', 'naver'],
  ['bytespider', 'bytespider'],
  // SEO crawlers. High volume on any indexed site, and all six were being
  // counted as human before.
  ['ahrefsbot', 'ahrefs'],
  ['semrushbot', 'semrush'],
  ['mj12bot', 'majestic'],
  ['dotbot', 'moz'],
  ['screaming frog', 'screamingfrog'],
  // LLM crawlers. Directly relevant: the site is built to be quotable by them.
  ['gptbot', 'gptbot'],
  ['oai-searchbot', 'oai-searchbot'],
  ['chatgpt-user', 'chatgpt-user'],
  ['claudebot', 'claudebot'],
  ['anthropic-ai', 'anthropic-ai'],
  ['claude-web', 'claude-web'],
  ['perplexitybot', 'perplexitybot'],
  ['cohere-ai', 'cohere-ai'],
  ['meta-externalagent', 'meta'],
  ['facebookexternalhit', 'facebook'],
  ['twitterbot', 'twitter'],
  ['linkedinbot', 'linkedin'],
  ['slackbot', 'slack'],
  ['discordbot', 'discord'],
];

/** Anything automated that did not name itself above. */
const GENERIC_HINTS = [
  'bot',
  'heritrix',
  'nutch',
  'cloudflare-',
  'crawl',
  'spider',
  'slurp',
  'scrape',
  'osint',
  'headless',
  'phantomjs',
  'playwright',
  'puppeteer',
  'selenium',
  'uptime',
  'pingdom',
  'lighthouse',
  'curl/',
  'wget/',
  'python',
  'aiohttp',
  'httpx',
  'requests/',
  'okhttp',
  'httpclient',
  'java/',
  'libwww',
  'go-http-client',
  'scrapy',
  'axios',
  'node-fetch',
  'postman',
  'insomnia',
  'feedfetcher',
  'monitoring',
];

/**
 * Crawlers conventionally put a contact URL in the agent string. No shipping
 * browser does, which is what makes this safe to treat as automation.
 */
const URL_IN_AGENT = new RegExp(String.raw`https?://`);

/**
 * Chrome older than 80 on Windows XP through 7 is, in practice, a crawler
 * wearing a costume rather than someone on a very old machine.
 */
function isLegacyBrowserBot(ua) {
  const oldWindows =
    ua.includes('windows nt 5.') || ua.includes('windows nt 6.0') || ua.includes('windows nt 6.1');
  if (!oldWindows) return false;
  const chrome = /chrome\/(\d+)\./.exec(ua);
  return Boolean(chrome) && Number(chrome[1]) > 0 && Number(chrome[1]) < 80;
}

/**
 * @param {string|null|undefined} userAgent
 * @returns {{isBot: boolean, botKind: string|null}}
 */
export function classifyUserAgent(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  // A request with no user-agent at all is almost never a browser, but it is
  // not worth naming either.
  if (!ua) return { isBot: true, botKind: 'no-user-agent' };

  for (const [needle, kind] of NAMED_BOTS) {
    if (ua.includes(needle)) return { isBot: true, botKind: kind };
  }
  for (const hint of GENERIC_HINTS) {
    if (ua.includes(hint)) return { isBot: true, botKind: 'generic-bot' };
  }

  // A user-agent carrying a URL is a crawler identifying itself, which is a
  // convention no mainstream browser follows. This is the general form of the
  // name-by-name list above: it catches heritrix, the "+http://...bot.html"
  // style, and one-off research scanners that announce an institution.
  if (URL_IN_AGENT.test(ua)) return { isBot: true, botKind: 'self-identified-crawler' };
  if (isLegacyBrowserBot(ua)) return { isBot: true, botKind: 'legacy-browser-bot' };

  return { isBot: false, botKind: null };
}
