/**
 * Firecrawl API wrapper — shared by brand extraction (onboarding) and competitor scraping.
 *
 * Primary:  Firecrawl (@mendable/firecrawl-js v4, default export is `Firecrawl` / `FirecrawlClient`)
 * Fallback: Jina Reader (https://r.jina.ai) + raw fetch + cheerio
 */

import * as cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawlOptions {
  limit?: number;
  includePaths?: string[];
  excludePaths?: string[];
}

export interface PageResult {
  url: string;
  markdown: string;
  html: string;
  metadata: {
    title: string | null;
    description: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    themeColor: string | null;
  };
  jsonLd: Record<string, unknown>[];
  links: string[];
}

export interface CrawlResult {
  pages: PageResult[];
  totalCrawled: number;
}

export interface VisualData {
  fontFamilies: string[];
  colors: string[];
  logoUrl: string | null;
  themeColor: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getFirecrawlKey(): string | null {
  return process.env.FIRECRAWL_API_KEY ?? null;
}

const TIMEOUT_MS = 15_000;

/** Fetch with a hard 15 s timeout. */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Visual extraction
// ---------------------------------------------------------------------------

/**
 * Extract visual brand data (fonts, colors, logo) from raw HTML using cheerio.
 */
export function extractVisualData(html: string): VisualData {
  const $ = cheerio.load(html);

  // --- Fonts ---
  const fontFamilies = new Set<string>();

  // Google Fonts: <link href="https://fonts.googleapis.com/css?family=Roboto">
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const familyMatch = href.match(/family=([^&:]+)/);
    if (familyMatch && familyMatch[1]) {
      const families = decodeURIComponent(familyMatch[1])
        .split('|')
        .map((f) => (f.split(':')[0] ?? f).replace(/\+/g, ' ').trim())
        .filter(Boolean);
      families.forEach((f) => fontFamilies.add(f));
    }
  });

  // CSS font-family from <style> blocks and inline style attributes
  const fontFamilyRegex = /font-family\s*:\s*([^;}"']+)/gi;
  const styleTexts: string[] = [];
  $('style').each((_, el) => {
    const content = $(el).html();
    if (content) styleTexts.push(content);
  });
  $('[style]').each((_, el) => {
    const style = $(el).attr('style');
    if (style) styleTexts.push(style);
  });

  for (const text of styleTexts) {
    // Reset lastIndex because the regex is reused across iterations
    fontFamilyRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = fontFamilyRegex.exec(text)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      // Split comma-separated values and clean quotes
      raw
        .split(',')
        .map((f) => f.replace(/['"]/g, '').trim())
        .filter(
          (f) =>
            f &&
            !f.startsWith('-') &&
            f.toLowerCase() !== 'inherit' &&
            f.toLowerCase() !== 'sans-serif' &&
            f.toLowerCase() !== 'serif' &&
            f.toLowerCase() !== 'monospace'
        )
        .forEach((f) => fontFamilies.add(f));
    }
  }

  // --- Colors ---
  const colors = new Set<string>();

  // CSS custom properties (color variables) and hex colors from style blocks + inline styles
  const hexColorRegex = /#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b/g;
  const cssVarColorRegex = /--[\w-]*color[\w-]*\s*:\s*([^;}"']+)/gi;

  for (const text of styleTexts) {
    // Hex colors
    hexColorRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = hexColorRegex.exec(text)) !== null) {
      colors.add(m[0].toLowerCase());
    }
    // CSS variable colors
    cssVarColorRegex.lastIndex = 0;
    while ((m = cssVarColorRegex.exec(text)) !== null) {
      const val = m[1]?.trim();
      if (val && val.startsWith('#')) colors.add(val.toLowerCase());
    }
  }

  // theme-color meta
  const themeColor =
    $('meta[name="theme-color"]').attr('content') ??
    $('meta[name="msapplication-TileColor"]').attr('content') ??
    null;

  if (themeColor && themeColor.startsWith('#')) {
    colors.add(themeColor.toLowerCase());
  }

  // --- Logo ---
  let logoUrl: string | null = null;

  // 1. JSON-LD Organization logo
  const jsonLdEntries = extractJsonLd(html);
  for (const entry of jsonLdEntries) {
    const type = entry['@type'];
    if (type === 'Organization' || type === 'WebSite') {
      const logo = entry['logo'];
      if (typeof logo === 'string') {
        logoUrl = logo;
        break;
      } else if (logo && typeof logo === 'object') {
        const logoObj = logo as Record<string, unknown>;
        if (typeof logoObj['url'] === 'string') {
          logoUrl = logoObj['url'];
          break;
        }
      }
    }
  }

  // 2. OG image fallback
  if (!logoUrl) {
    logoUrl = $('meta[property="og:image"]').attr('content') ?? null;
  }

  // 3. img[alt*="logo" i] or img[class*="logo" i] or img[id*="logo" i]
  if (!logoUrl) {
    const logoImg = $('img').filter((_, el) => {
      const alt = ($(el).attr('alt') ?? '').toLowerCase();
      const cls = ($(el).attr('class') ?? '').toLowerCase();
      const id = ($(el).attr('id') ?? '').toLowerCase();
      return alt.includes('logo') || cls.includes('logo') || id.includes('logo');
    });
    if (logoImg.length > 0) {
      logoUrl = logoImg.first().attr('src') ?? null;
    }
  }

  return {
    fontFamilies: Array.from(fontFamilies),
    colors: Array.from(colors),
    logoUrl,
    themeColor: themeColor ?? null,
  };
}

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

/**
 * Parse all <script type="application/ld+json"> blocks from HTML.
 */
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html);
  const results: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            results.push(item as Record<string, unknown>);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        const parsedObj = parsed as Record<string, unknown>;
        // Handle @graph
        const graph = parsedObj['@graph'];
        if (Array.isArray(graph)) {
          for (const item of graph) {
            if (item && typeof item === 'object') {
              results.push(item as Record<string, unknown>);
            }
          }
        } else {
          results.push(parsedObj);
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  });

  return results;
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extract OG tags, meta description, title, and theme-color from HTML.
 */
export function extractMetadata(html: string): PageResult['metadata'] {
  const $ = cheerio.load(html);

  return {
    title: $('title').first().text().trim() || null,
    description:
      $('meta[name="description"]').attr('content') ??
      $('meta[property="og:description"]').attr('content') ??
      null,
    ogTitle: $('meta[property="og:title"]').attr('content') ?? null,
    ogDescription: $('meta[property="og:description"]').attr('content') ?? null,
    ogImage: $('meta[property="og:image"]').attr('content') ?? null,
    themeColor:
      $('meta[name="theme-color"]').attr('content') ??
      $('meta[name="msapplication-TileColor"]').attr('content') ??
      null,
  };
}

// ---------------------------------------------------------------------------
// Link extraction (same-domain)
// ---------------------------------------------------------------------------

function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();

  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin === origin) {
        seen.add(resolved.href);
      }
    } catch {
      // Ignore invalid hrefs
    }
  });

  return Array.from(seen);
}

// ---------------------------------------------------------------------------
// Helpers to map SDK Document → PageResult
// ---------------------------------------------------------------------------

interface FirecrawlDocument {
  markdown?: string;
  html?: string;
  metadata?: { url?: string; sourceURL?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function documentToPageResult(doc: FirecrawlDocument, fallbackUrl: string): PageResult {
  const url =
    (doc.metadata?.url as string | undefined) ??
    (doc.metadata?.sourceURL as string | undefined) ??
    fallbackUrl;
  const html = doc.html ?? '';
  const markdown = doc.markdown ?? '';
  return {
    url,
    markdown,
    html,
    metadata: extractMetadata(html),
    jsonLd: extractJsonLd(html),
    links: extractLinks(html, url),
  };
}

// ---------------------------------------------------------------------------
// Firecrawl-based implementations
// ---------------------------------------------------------------------------

async function firecrawlScrape(url: string, apiKey: string): Promise<PageResult> {
  // v4 default export is `Firecrawl` (subclass of FirecrawlClient)
  const FirecrawlApp = (await import('@mendable/firecrawl-js')).default;
  const app = new FirecrawlApp({ apiKey });

  const result = await (app as unknown as {
    scrape(url: string, opts: { formats: string[] }): Promise<FirecrawlDocument>;
  }).scrape(url, { formats: ['markdown', 'html'] });

  return documentToPageResult(result, url);
}

async function firecrawlCrawl(
  url: string,
  apiKey: string,
  options: CrawlOptions
): Promise<CrawlResult> {
  const FirecrawlApp = (await import('@mendable/firecrawl-js')).default;
  const app = new FirecrawlApp({ apiKey });

  // The SDK's CrawlOptions type name collides with our local one, so we cast
  const crawlReq: Record<string, unknown> = {
    limit: options.limit ?? 10,
    scrapeOptions: { formats: ['markdown', 'html'] },
  };
  if (options.includePaths && options.includePaths.length > 0) {
    crawlReq['includePaths'] = options.includePaths;
  }
  if (options.excludePaths && options.excludePaths.length > 0) {
    crawlReq['excludePaths'] = options.excludePaths;
  }

  const job = await (app as unknown as {
    crawl(url: string, req: Record<string, unknown>): Promise<{ data: FirecrawlDocument[] }>;
  }).crawl(url, crawlReq);

  const rawPages: FirecrawlDocument[] = job.data ?? [];
  const pages: PageResult[] = rawPages.map((doc) => documentToPageResult(doc, url));

  return { pages, totalCrawled: pages.length };
}

// ---------------------------------------------------------------------------
// Jina Reader + raw fetch fallback
// ---------------------------------------------------------------------------

async function jinaFallbackScrape(url: string): Promise<PageResult> {
  // Jina Reader returns clean markdown
  const jinaUrl = `https://r.jina.ai/${url}`;
  let markdown = '';
  let html = '';

  try {
    const jinaRes = await fetchWithTimeout(jinaUrl, {
      headers: { Accept: 'text/plain' },
    });
    if (jinaRes.ok) {
      markdown = await jinaRes.text();
    }
  } catch {
    // Jina unavailable; continue with empty markdown
  }

  // Raw fetch for HTML (for visual / link extraction)
  try {
    const rawRes = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrowthOS/1.0; +https://growth-os.app)',
      },
    });
    if (rawRes.ok) {
      html = await rawRes.text();
    }
  } catch {
    // Ignore network errors
  }

  return {
    url,
    markdown,
    html,
    metadata: extractMetadata(html),
    jsonLd: extractJsonLd(html),
    links: extractLinks(html, url),
  };
}

async function jinaFallbackCrawl(url: string, options: CrawlOptions): Promise<CrawlResult> {
  const limit = options.limit ?? 10;

  // Start with the root page
  const root = await jinaFallbackScrape(url);
  const visited = new Set<string>([url]);
  const queue: string[] = root.links.slice(0, limit - 1);
  const pages: PageResult[] = [root];

  for (let i = 0; i < queue.length; i++) {
    if (pages.length >= limit) break;
    const link = queue[i];
    if (!link || visited.has(link)) continue;
    visited.add(link);

    // Filter by includePaths / excludePaths
    if (options.includePaths && options.includePaths.length > 0) {
      try {
        const path = new URL(link).pathname;
        if (!options.includePaths.some((p) => path.startsWith(p))) continue;
      } catch {
        continue;
      }
    }
    if (options.excludePaths && options.excludePaths.length > 0) {
      try {
        const path = new URL(link).pathname;
        if (options.excludePaths.some((p) => path.startsWith(p))) continue;
      } catch {
        continue;
      }
    }

    try {
      const page = await jinaFallbackScrape(link);
      pages.push(page);
      // Enqueue newly discovered links
      for (const newLink of page.links) {
        if (!visited.has(newLink)) {
          queue.push(newLink);
        }
      }
    } catch {
      // Skip pages that fail
    }
  }

  return { pages, totalCrawled: pages.length };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrape a single page.
 * Uses Firecrawl if the API key is available, otherwise falls back to Jina Reader + raw fetch.
 */
export async function scrapePage(url: string): Promise<PageResult> {
  const apiKey = getFirecrawlKey();

  if (apiKey) {
    try {
      return await firecrawlScrape(url, apiKey);
    } catch (err) {
      console.warn('[firecrawl-client] Firecrawl scrape failed, falling back to Jina:', err);
    }
  }

  return jinaFallbackScrape(url);
}

/**
 * Crawl multiple pages of a site.
 * Uses Firecrawl if the API key is available, otherwise falls back to Jina Reader + BFS crawl.
 */
export async function crawlSite(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const apiKey = getFirecrawlKey();

  if (apiKey) {
    try {
      return await firecrawlCrawl(url, apiKey, options);
    } catch (err) {
      console.warn('[firecrawl-client] Firecrawl crawl failed, falling back to Jina:', err);
    }
  }

  return jinaFallbackCrawl(url, options);
}
