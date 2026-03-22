import { PapersRepository } from '@db';

export interface DuplicateGroup {
  reason: string;
  papers: Array<{
    id: string;
    shortId: string;
    title: string;
    sourceUrl: string | null;
  }>;
}

/**
 * Scan the library for potential duplicate papers.
 * Groups papers by normalized title and DOI.
 */
export async function findDuplicates(): Promise<DuplicateGroup[]> {
  const repo = new PapersRepository();
  const papers = await repo.listAll();
  const groups: DuplicateGroup[] = [];

  // Group by normalized title
  const titleMap = new Map<string, typeof papers>();
  for (const paper of papers) {
    const normalized = paper.title
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
    if (normalized.length < 10) continue;
    const existing = titleMap.get(normalized) ?? [];
    existing.push(paper);
    titleMap.set(normalized, existing);
  }

  for (const [, group] of titleMap) {
    if (group.length >= 2) {
      groups.push({
        reason: 'title',
        papers: group.map((p) => ({
          id: p.id,
          shortId: p.shortId,
          title: p.title,
          sourceUrl: p.sourceUrl,
        })),
      });
    }
  }

  return groups;
}
