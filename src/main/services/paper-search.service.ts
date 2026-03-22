/**
 * Paper search service.
 * Tries OpenAlex first (generous rate limits, no API key needed),
 * falls back to Semantic Scholar if OpenAlex returns no results.
 */
import { proxyFetch } from './proxy-fetch';
import { getProxy, getProxyEnabled, getProxyScope } from '../store/app-settings-store';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'node:http';

const S2_API_BASE = 'https://api.semanticscholar.org/graph/v1';
const OPENALEX_API_BASE = 'https://api.openalex.org';

export interface SearchResult {
  paperId: string;
  title: string;
  authors: Array<{ name: string }>;
  year: number | null;
  abstract: string | null;
  citationCount: number;
  externalIds: {
    ArXiv?: string;
    DOI?: string;
  };
  url: string | null;
  venue?: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

function getProxyAgent(): Agent | undefined {
  const proxy = getProxy();
  const proxyEnabled = getProxyEnabled();
  const scope = getProxyScope();
  if (!proxyEnabled || !proxy || !scope.pdfDownload) return undefined;
  return new HttpsProxyAgent(proxy);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Search papers: OpenAlex first, Semantic Scholar as fallback.
 * Handles DOI input by doing a direct lookup instead of text search.
 */
export async function searchPapers(query: string, limit: number = 20): Promise<SearchResponse> {
  // Clean up query: fix PDF line-break hyphens and remove venue/journal suffixes
  query = query
    .replace(/(\w)- (\w)/g, '$1$2') // "Engi- neering" → "Engineering"
    .replace(/["\u201C\u201D\u201E\u00AB\u00BB\u0022]+/g, '') // Strip quote chars
    .replace(/["\u201D\u00BB]?\s*[Ii]n\s*:\s*.*$/, '') // "In: arXiv preprint..."
    .replace(/["\u201D\u00BB]?\s*[Ii]n\s+(?:Proceedings|Proc\b|Advances\b).*$/i, '')
    .replace(/\s*,?\s*arXiv\s+preprint\s+arXiv[:\s]*\d{4}\.\d{4,5}.*$/i, '')
    .replace(
      /[.,]\s*(?:IEEE|ACM|Springer|Elsevier|In\s+Proceedings|Proceedings|Trans\.|Transactions|Journal|Conference|Workshop|Symposium)\b.*/i,
      '',
    ) // Remove venue suffix
    .replace(/\s*\d+\s*,\s*\d+\s*\(\d{4}\).*$/, '') // Remove "47, 9 (2019)"
    .replace(/\s*\(\d{4}\).*$/, '') // Remove "(2019)..."
    .replace(/\s*,\s*\d{4}\s*\.?\s*$/, '') // Remove ", 2019."
    .replace(/[,;.]+\s*$/, '') // Trailing punctuation
    .trim();

  // If query looks like a DOI, do direct lookup first
  if (/^10\.\d{4,}\/\S+$/.test(query.trim())) {
    try {
      const doiResult = await lookupByDoi(query.trim());
      if (doiResult) {
        console.log(`[paper-search] DOI lookup found: "${doiResult.title}"`);
        return { results: [doiResult], total: 1 };
      }
    } catch {
      // Fall through to text search
    }
  }

  // OpenAlex only
  return searchOpenAlex(query, limit);
}

/**
 * Look up a single paper by DOI on OpenAlex.
 */
async function lookupByDoi(doi: string): Promise<SearchResult | null> {
  const agent = getProxyAgent();
  const res = await proxyFetch(
    `${OPENALEX_API_BASE}/works/doi:${encodeURIComponent(doi)}?select=id,title,authorships,publication_year,abstract_inverted_index,cited_by_count,ids,primary_location,doi`,
    {
      agent,
      timeoutMs: 10_000,
      headers: { 'User-Agent': 'ResearchClaw/1.0 (mailto:researchclaw@example.com)' },
    },
  );

  if (!res.ok) return null;
  const item = JSON.parse(res.text());
  if (!item?.title) return null;

  let abstract: string | null = null;
  if (item.abstract_inverted_index) {
    abstract = reconstructAbstract(item.abstract_inverted_index);
  }

  let arxivId: string | undefined;
  const primarySource = item.primary_location?.source;
  if (primarySource?.display_name === 'arXiv (Cornell University)') {
    const landingUrl = item.primary_location?.landing_page_url ?? '';
    const arxivMatch = landingUrl.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/);
    if (arxivMatch) arxivId = arxivMatch[1];
  }

  return {
    paperId: item.ids?.openalex ?? item.id ?? '',
    title: item.title,
    authors: (item.authorships ?? []).map((a: any) => ({
      name: a.author?.display_name ?? 'Unknown',
    })),
    year: item.publication_year ?? null,
    abstract,
    citationCount: item.cited_by_count ?? 0,
    externalIds: {
      ArXiv: arxivId,
      DOI: item.doi?.replace('https://doi.org/', ''),
    },
    url: item.doi ?? item.id ?? null,
    venue:
      item.primary_location?.source?.display_name ?? item.primary_location?.raw_source_name ?? null,
  };
}

/**
 * Search papers using OpenAlex API.
 * Rate limit: 100,000 requests/day with polite pool (email in User-Agent).
 * No API key needed.
 */
const OA_SELECT =
  'id,title,authorships,publication_year,abstract_inverted_index,cited_by_count,ids,primary_location,doi';
const OA_HEADERS = { 'User-Agent': 'ResearchClaw/1.0 (mailto:researchclaw@example.com)' };

function parseOpenAlexItem(item: any): SearchResult {
  let abstract: string | null = null;
  if (item.abstract_inverted_index) {
    abstract = reconstructAbstract(item.abstract_inverted_index);
  }

  let arxivId: string | undefined;
  const openalexId = item.ids?.openalex;
  const primarySource = item.primary_location?.source;
  if (primarySource?.display_name === 'arXiv (Cornell University)') {
    const landingUrl = item.primary_location?.landing_page_url ?? '';
    const arxivMatch = landingUrl.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/);
    if (arxivMatch) arxivId = arxivMatch[1];
  }

  let doi: string | undefined;
  if (item.doi) {
    doi = item.doi.replace('https://doi.org/', '');
  }

  const venue =
    item.primary_location?.source?.display_name ?? item.primary_location?.raw_source_name ?? null;

  return {
    paperId: openalexId ?? item.id ?? '',
    title: item.title ?? 'Untitled',
    authors: (item.authorships ?? []).map((a: any) => ({
      name: a.author?.display_name ?? 'Unknown',
    })),
    year: item.publication_year ?? null,
    abstract,
    citationCount: item.cited_by_count ?? 0,
    externalIds: { ArXiv: arxivId, DOI: doi },
    url: item.doi ?? item.id ?? null,
    venue,
  };
}

/**
 * Search papers using OpenAlex API.
 * Runs fulltext search + title search in parallel for better recall.
 */
async function searchOpenAlex(query: string, limit: number): Promise<SearchResponse> {
  const agent = getProxyAgent();
  const encodedQuery = encodeURIComponent(query);

  // Parallel: fulltext search + title-specific search
  const fulltextUrl = `${OPENALEX_API_BASE}/works?search=${encodedQuery}&per_page=${limit}&select=${OA_SELECT}`;
  const titleUrl = `${OPENALEX_API_BASE}/works?filter=title.search:${encodedQuery}&per_page=${Math.min(limit, 10)}&select=${OA_SELECT}`;

  const [fulltextRes, titleRes] = await Promise.allSettled([
    proxyFetch(fulltextUrl, { agent, timeoutMs: 15_000, headers: OA_HEADERS }),
    proxyFetch(titleUrl, { agent, timeoutMs: 15_000, headers: OA_HEADERS }),
  ]);

  const fulltextItems: any[] =
    fulltextRes.status === 'fulfilled' && fulltextRes.value.ok
      ? (JSON.parse(fulltextRes.value.text())?.results ?? [])
      : [];
  const titleItems: any[] =
    titleRes.status === 'fulfilled' && titleRes.value.ok
      ? (JSON.parse(titleRes.value.text())?.results ?? [])
      : [];

  // Merge: title matches first (more precise), then fulltext, deduplicate by OpenAlex ID
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const item of [...titleItems, ...fulltextItems]) {
    const id = item.ids?.openalex ?? item.id ?? '';
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(parseOpenAlexItem(item));
  }

  console.log(
    `[paper-search] OpenAlex fulltext: ${fulltextItems.length}, title: ${titleItems.length}, merged: ${merged.length} for "${query}"`,
  );

  return {
    results: merged.slice(0, limit),
    total: merged.length,
  };
}

/**
 * Reconstruct abstract text from OpenAlex inverted index format.
 * OpenAlex stores abstracts as { "word": [position1, position2], ... }
 */
function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string | null {
  if (!invertedIndex || typeof invertedIndex !== 'object') return null;

  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }

  if (words.length === 0) return null;
  words.sort((a, b) => a[0] - b[0]);
  return words.map(([, w]) => w).join(' ');
}

/**
 * Search papers using Semantic Scholar API (fallback).
 */
async function searchSemanticScholar(query: string, limit: number): Promise<SearchResponse> {
  const encodedQuery = encodeURIComponent(query);
  const fields = [
    'paperId',
    'title',
    'authors',
    'year',
    'abstract',
    'citationCount',
    'externalIds',
    'url',
  ].join(',');

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const url = `${S2_API_BASE}/paper/search?query=${encodedQuery}&limit=${limit}&fields=${fields}`;
      console.log(`[paper-search] S2 attempt ${attempt + 1}: ${url}`);

      const agent = getProxyAgent();
      const res = await proxyFetch(url, { agent, timeoutMs: 15_000 });

      if (res.status === 429) {
        const waitTime = Math.min(2000 * Math.pow(2, attempt), 10000);
        console.warn(`[paper-search] S2 rate limited (429). Retrying in ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }

      if (!res.ok) {
        throw new Error(`S2 HTTP ${res.status}`);
      }

      const json = JSON.parse(res.text());
      const results: SearchResult[] = (json?.data ?? []).map((item: any) => ({
        paperId: item.paperId,
        title: item.title ?? 'Untitled',
        authors: item.authors ?? [],
        year: item.year ?? null,
        abstract: item.abstract ?? null,
        citationCount: item.citationCount ?? 0,
        externalIds: item.externalIds ?? {},
        url: item.url ?? null,
      }));

      console.log(`[paper-search] S2 returned ${results.length} results`);
      return { results, total: json?.total ?? results.length };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[paper-search] S2 attempt ${attempt + 1} failed:`, lastError.message);
      if (attempt < maxRetries - 1) {
        await sleep(2000 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new Error('Search failed after retries');
}
