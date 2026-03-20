import { afterEach, describe, expect, it, vi } from 'vitest';

const proxyFetch = vi.fn();

vi.mock('../../src/main/services/proxy-fetch', () => ({
  proxyFetch,
}));

// Mock Prisma to return empty extracted references (no real DB needed)
vi.mock('../../src/db', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getPrismaClient: () => ({
      extractedReference: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    }),
  };
});

describe('citation extraction service', () => {
  afterEach(() => {
    proxyFetch.mockReset();
    vi.resetModules();
  });

  it('returns empty result when no extracted references exist', async () => {
    const { CitationExtractionService } =
      await import('../../src/main/services/citation-extraction.service');

    const service = new CitationExtractionService();

    const result = await service.extractForPaper({
      id: 'paper-1',
      shortId: '1706.03762',
      title: 'Attention Is All You Need',
      sourceUrl: 'https://arxiv.org/abs/1706.03762',
    });

    expect(result).toMatchObject({
      referencesFound: 0,
      citationsFound: 0,
      matched: 0,
    });

    expect(proxyFetch).not.toHaveBeenCalled();
  });
});
