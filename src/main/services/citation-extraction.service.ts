/**
 * Citation extraction service.
 * Fetches references and citations from Semantic Scholar API,
 * then matches them to local papers in the library.
 */
import { proxyFetch } from './proxy-fetch';
import { CitationsRepository, type CreateCitationParams } from '@db';

const S2_API_BASE = 'https://api.semanticscholar.org/graph/v1';

interface S2Reference {
  paperId: string | null;
  title: string;
  authors?: Array<{ name: string }>;
  year?: number;
  externalIds?: Record<string, string>;
  contexts?: string[];
}

interface S2PaperCitations {
  references: S2Reference[];
  citations: S2Reference[];
}

function extractArxivId(paper: { shortId?: string; sourceUrl?: string | null }): string | null {
  if (paper.shortId && /^\d{4}\.\d{4,5}$/.test(paper.shortId)) {
    return paper.shortId;
  }
  if (paper.sourceUrl) {
    const match = paper.sourceUrl.match(/arxiv\.org\/(?:abs|pdf)\/([^/?]+?)(?:\.pdf)?$/);
    if (match) return match[1].replace(/v\d+$/, '');
  }
  return null;
}

function isTitleSimilar(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const unionSize = new Set([...wordsA, ...wordsB]).size;
  return unionSize > 0 && intersection.length / unionSize > 0.6;
}

async function fetchS2Citations(s2PaperId: string): Promise<S2PaperCitations | null> {
  try {
    const fields = 'title,authors,year,externalIds,contexts';
    const res = await proxyFetch(
      `${S2_API_BASE}/paper/${s2PaperId}?fields=references,citations,references.${fields},citations.${fields}`,
      { timeoutMs: 15_000 },
    );
    if (!res.ok) return null;
    const json = JSON.parse(res.text());
    return {
      references: json.references ?? [],
      citations: json.citations ?? [],
    };
  } catch {
    return null;
  }
}

export class CitationExtractionService {
  private citationsRepo = new CitationsRepository();

  async extractForPaper(paper: {
    id: string;
    shortId: string;
    title: string;
    sourceUrl?: string | null;
  }): Promise<{ referencesFound: number; citationsFound: number; matched: number }> {
    // Determine S2 paper ID
    const arxivId = extractArxivId(paper);
    let s2Id = arxivId ? `ArXiv:${arxivId}` : null;

    // If no arXiv ID, try title search
    if (!s2Id) {
      s2Id = await this.searchS2ByTitle(paper.title);
    }

    if (!s2Id) {
      return { referencesFound: 0, citationsFound: 0, matched: 0 };
    }

    const data = await fetchS2Citations(s2Id);
    if (!data) {
      return { referencesFound: 0, citationsFound: 0, matched: 0 };
    }

    // Get all local papers for matching
    const localPapers = await this.citationsRepo.getAllLocalPaperTitles();

    const citations: CreateCitationParams[] = [];
    let matched = 0;

    // Process references (papers this paper cites)
    for (const ref of data.references) {
      if (!ref.paperId && !ref.title) continue;

      const localMatch = this.findLocalMatch(ref, localPapers);
      if (localMatch) matched++;

      citations.push({
        sourcePaperId: paper.id,
        targetPaperId: localMatch?.id ?? null,
        externalTitle: ref.title,
        externalId: ref.paperId ?? `title:${ref.title}`,
        citationType: 'reference',
        context: ref.contexts?.[0] ?? null,
        confidence: localMatch ? 1.0 : 0.5,
      });
    }

    // Process citations (papers that cite this paper)
    for (const cit of data.citations) {
      if (!cit.paperId && !cit.title) continue;

      const localMatch = this.findLocalMatch(cit, localPapers);
      if (localMatch) matched++;

      // For citations, the citing paper is the source
      if (localMatch) {
        citations.push({
          sourcePaperId: localMatch.id,
          targetPaperId: paper.id,
          externalTitle: cit.title,
          externalId: cit.paperId ?? `title:${cit.title}`,
          citationType: 'reference',
          context: cit.contexts?.[0] ?? null,
          confidence: 1.0,
        });
      }
    }

    if (citations.length > 0) {
      await this.citationsRepo.createMany(citations);
    }

    return {
      referencesFound: data.references.length,
      citationsFound: data.citations.length,
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
    ref: S2Reference,
    localPapers: Array<{ id: string; title: string; shortId: string; sourceUrl: string | null }>,
  ): { id: string } | null {
    // Try matching by arXiv ID first
    const refArxivId = ref.externalIds?.ArXiv;
    if (refArxivId) {
      const match = localPapers.find(
        (p) => p.shortId === refArxivId || p.sourceUrl?.includes(refArxivId),
      );
      if (match) return { id: match.id };
    }

    // Try title matching
    if (ref.title) {
      const match = localPapers.find((p) => isTitleSimilar(p.title, ref.title));
      if (match) return { id: match.id };
    }

    return null;
  }

  private async searchS2ByTitle(title: string): Promise<string | null> {
    try {
      const query = encodeURIComponent(title);
      const res = await proxyFetch(
        `${S2_API_BASE}/paper/search?query=${query}&limit=1&fields=title`,
        { timeoutMs: 10_000 },
      );
      if (!res.ok) return null;

      const json = JSON.parse(res.text());
      const first = json?.data?.[0];
      if (!first?.paperId) return null;

      if (!isTitleSimilar(title, first.title)) return null;
      return first.paperId;
    } catch {
      return null;
    }
  }
}
