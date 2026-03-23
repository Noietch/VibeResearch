/**
 * Citation extraction service.
 * Uses PDF-extracted references (from ExtractedReference table) as the source,
 * then searches OpenAlex to enrich with metadata and match to local papers.
 */
import { proxyFetch } from './proxy-fetch';
import { CitationsRepository, type CreateCitationParams } from '@db';
import { getPrismaClient } from '@db';
import { getProxy, getProxyEnabled, getProxyScope } from '../store/app-settings-store';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'node:http';
import { isTitleSimilar } from '@shared';

const OPENALEX_BASE = 'https://api.openalex.org';
const OPENALEX_HEADERS = {
  'User-Agent': 'ResearchClaw/1.0 (mailto:researchclaw@example.com)',
};

function getProxyAgent(): Agent | undefined {
  const proxy = getProxy();
  const proxyEnabled = getProxyEnabled();
  const scope = getProxyScope();
  if (!proxyEnabled || !proxy || !scope.pdfDownload) return undefined;
  return new HttpsProxyAgent(proxy);
}

export class CitationExtractionError extends Error {
  retryable: boolean;
  status?: number;

  constructor(message: string, options?: { retryable?: boolean; status?: number }) {
    super(message);
    this.name = 'CitationExtractionError';
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
  }
}

/**
 * Search OpenAlex for a reference by title, returning arXiv ID and DOI if found.
 */
async function searchOpenAlexByTitle(
  title: string,
): Promise<{ arxivId?: string; doi?: string; openAlexId?: string } | null> {
  try {
    const agent = getProxyAgent();
    const res = await proxyFetch(
      `${OPENALEX_BASE}/works?search=${encodeURIComponent(title)}&per_page=3&select=id,title,ids,primary_location,doi`,
      { agent, timeoutMs: 10_000, headers: OPENALEX_HEADERS },
    );
    if (!res.ok) return null;

    const json = JSON.parse(res.text());
    for (const work of json?.results ?? []) {
      if (work?.title && isTitleSimilar(work.title, title)) {
        const arxivId = extractArxivIdFromUrl(work.primary_location?.landing_page_url);
        const doi = work.doi?.replace('https://doi.org/', '');
        return { arxivId, doi, openAlexId: work.id };
      }
    }
  } catch {
    // Silently fail — non-critical
  }
  return null;
}

function extractArxivIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/);
  return match ? match[1] : undefined;
}

export class CitationExtractionService {
  private citationsRepo = new CitationsRepository();

  /**
   * Extract citations for a paper using its PDF-extracted references.
   * 1. Read ExtractedReference entries from DB (populated by reference-extraction-bg)
   * 2. Match each reference against local library (by arXiv ID, DOI, title)
   * 3. For unmatched refs, optionally search OpenAlex for metadata enrichment
   * 4. Store matches in PaperCitation table
   */
  async extractForPaper(paper: {
    id: string;
    shortId: string;
    title: string;
    sourceUrl?: string | null;
  }): Promise<{ referencesFound: number; citationsFound: number; matched: number }> {
    const prisma = getPrismaClient();

    // Get PDF-extracted references
    const extractedRefs = await prisma.extractedReference.findMany({
      where: { paperId: paper.id },
      orderBy: { refNumber: 'asc' },
    });

    if (extractedRefs.length === 0) {
      console.log(`[citation-extraction] No extracted references for "${paper.title}", skipping`);
      return { referencesFound: 0, citationsFound: 0, matched: 0 };
    }

    console.log(
      `[citation-extraction] Processing ${extractedRefs.length} extracted references for "${paper.title}"`,
    );

    // Get all local papers for matching
    const localPapers = await this.citationsRepo.getAllLocalPaperTitles();

    const citations: CreateCitationParams[] = [];
    let matched = 0;

    for (const ref of extractedRefs) {
      // Try local match first (by arXiv ID, then title)
      let localMatch = this.findLocalMatch(
        { title: ref.title ?? '', arxivId: ref.arxivId ?? undefined, doi: ref.doi ?? undefined },
        localPapers,
      );

      // If no local match and has title, try OpenAlex to get arXiv ID / DOI
      if (!localMatch && ref.title && !ref.arxivId && !ref.doi) {
        const enriched = await searchOpenAlexByTitle(ref.title);
        if (enriched) {
          // Update the extracted reference with enriched data
          await prisma.extractedReference.update({
            where: { id: ref.id },
            data: {
              arxivId: enriched.arxivId ?? ref.arxivId,
              doi: enriched.doi ?? ref.doi,
            },
          });

          // Try local match again with enriched data
          localMatch = this.findLocalMatch(
            { title: ref.title, arxivId: enriched.arxivId, doi: enriched.doi },
            localPapers,
          );
        }

        // Small delay between OpenAlex calls
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (localMatch) matched++;

      citations.push({
        sourcePaperId: paper.id,
        targetPaperId: localMatch?.id ?? null,
        externalTitle: ref.title ?? ref.text.slice(0, 200),
        externalId: ref.arxivId ?? ref.doi ?? `ref:${ref.refNumber}`,
        citationType: 'reference',
        context: null,
        confidence: localMatch ? 1.0 : 0.5,
      });
    }

    if (citations.length > 0) {
      await this.citationsRepo.createMany(citations);
    }

    console.log(
      `[citation-extraction] Done: ${extractedRefs.length} refs, ${matched} matched locally`,
    );

    return {
      referencesFound: extractedRefs.length,
      citationsFound: 0,
      matched,
    };
  }

  async resolveUnmatched(): Promise<number> {
    const unresolved = await this.citationsRepo.findUnresolved();
    const localPapers = await this.citationsRepo.getAllLocalPaperTitles();
    let resolved = 0;

    for (const citation of unresolved) {
      if (!citation.externalTitle) continue;
      const match = localPapers.find((p) => isTitleSimilar(p.title, citation.externalTitle!));
      if (match) {
        await this.citationsRepo.resolveByTitle(citation.id, match.id);
        resolved++;
      }
    }

    return resolved;
  }

  private findLocalMatch(
    ref: { title: string; arxivId?: string; doi?: string },
    localPapers: Array<{ id: string; title: string; shortId: string; sourceUrl: string | null }>,
  ): { id: string } | null {
    // Try matching by arXiv ID first
    if (ref.arxivId) {
      const match = localPapers.find(
        (p) => p.shortId === ref.arxivId || p.sourceUrl?.includes(ref.arxivId!),
      );
      if (match) return { id: match.id };
    }

    // Try DOI match
    if (ref.doi) {
      const doiShortId = `doi-${ref.doi.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 80)}`;
      const match = localPapers.find((p) => p.shortId === doiShortId);
      if (match) return { id: match.id };
    }

    // Try title matching
    if (ref.title) {
      const match = localPapers.find((p) => isTitleSimilar(p.title, ref.title));
      if (match) return { id: match.id };
    }

    return null;
  }
}
