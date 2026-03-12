import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function waitFor(check: () => void, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      check();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  check();
}

describe('paper processing concurrency', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.VITEST;
    delete process.env.VIBE_PAPER_PROCESSING_CONCURRENCY;
  });

  afterEach(() => {
    delete process.env.VITEST;
    delete process.env.VIBE_PAPER_PROCESSING_CONCURRENCY;
  });

  it('fails fast when no abstract is available', async () => {
    const updateProcessingState = vi.fn().mockResolvedValue(undefined);

    vi.doMock('electron', () => ({
      BrowserWindow: { getAllWindows: () => [] },
    }));
    vi.doMock('@db', () => {
      class PapersRepository {
        findById = vi.fn(async (paperId: string) => ({
          id: paperId,
          shortId: 'local-123',
          source: 'manual',
          pdfPath: null,
          pdfUrl: null,
          sourceUrl: null,
          authors: [],
          abstract: null,
          submittedAt: null,
          metadataSource: null,
        }));
        updateProcessingState = updateProcessingState;
        updateMetadata = vi.fn().mockResolvedValue(undefined);
        replaceChunks = vi.fn().mockResolvedValue(undefined);
        listChunkIdsForPaper = vi.fn().mockResolvedValue([]);
        listPendingSemanticPaperIds = vi.fn().mockResolvedValue([]);
      }
      class PaperEmbeddingRepository {}
      return { PapersRepository, PaperEmbeddingRepository };
    });
    vi.doMock('../../src/main/store/app-settings-store', () => ({
      getSemanticSearchSettings: vi.fn(() => ({
        enabled: true,
        autoProcess: true,
        autoStartOllama: true,
        baseUrl: 'http://127.0.0.1:11434',
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingProvider: 'builtin',
      })),
    }));
    vi.doMock('../../src/main/services/search-unit-sync.service', () => ({
      rebuildSearchUnitsForPaper: vi.fn(),
    }));

    const { retryPaperProcessing } =
      await import('../../src/main/services/paper-processing.service');

    await retryPaperProcessing('paper-a');

    await waitFor(() =>
      expect(updateProcessingState).toHaveBeenCalledWith(
        'paper-a',
        expect.objectContaining({
          processingStatus: 'failed',
          processingError: 'No abstract available for indexing.',
          indexedAt: null,
        }),
      ),
    );
  });

  it('calls rebuildSearchUnitsForPaper when abstract is present', async () => {
    const updateProcessingState = vi.fn().mockResolvedValue(undefined);
    const rebuildSearchUnitsForPaper = vi.fn().mockResolvedValue(undefined);

    vi.doMock('electron', () => ({
      BrowserWindow: { getAllWindows: () => [] },
    }));
    vi.doMock('@db', () => {
      class PapersRepository {
        findById = vi.fn(async (paperId: string) => ({
          id: paperId,
          shortId: paperId,
          source: 'manual',
          pdfPath: '/tmp/mock.pdf',
          pdfUrl: null,
          sourceUrl: null,
          authors: [],
          abstract: 'This paper studies transformer alignment.',
          submittedAt: null,
          metadataSource: null,
        }));
        updateProcessingState = updateProcessingState;
        updateMetadata = vi.fn().mockResolvedValue(undefined);
        replaceChunks = vi.fn().mockResolvedValue(undefined);
        listChunkIdsForPaper = vi.fn().mockResolvedValue([]);
        listPendingSemanticPaperIds = vi.fn().mockResolvedValue([]);
      }
      class PaperEmbeddingRepository {}
      return { PapersRepository, PaperEmbeddingRepository };
    });
    vi.doMock('../../src/main/store/app-settings-store', () => ({
      getSemanticSearchSettings: vi.fn(() => ({
        enabled: true,
        autoProcess: true,
        autoStartOllama: true,
        baseUrl: 'http://127.0.0.1:11434',
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingProvider: 'builtin',
      })),
    }));
    vi.doMock('../../src/main/services/search-unit-sync.service', () => ({
      rebuildSearchUnitsForPaper,
    }));

    const { retryPaperProcessing } =
      await import('../../src/main/services/paper-processing.service');

    await retryPaperProcessing('paper-a');

    expect(rebuildSearchUnitsForPaper).toHaveBeenCalledWith('paper-a');
    await waitFor(() =>
      expect(updateProcessingState).toHaveBeenCalledWith(
        'paper-a',
        expect.objectContaining({ processingStatus: 'completed' }),
      ),
    );
  });

  it('marks paper as failed when rebuildSearchUnitsForPaper throws', async () => {
    const updateProcessingState = vi.fn().mockResolvedValue(undefined);

    vi.doMock('electron', () => ({
      BrowserWindow: { getAllWindows: () => [] },
    }));
    vi.doMock('@db', () => {
      class PapersRepository {
        findById = vi.fn(async (paperId: string) => ({
          id: paperId,
          shortId: paperId,
          source: 'manual',
          pdfPath: '/tmp/mock.pdf',
          pdfUrl: null,
          sourceUrl: null,
          authors: [],
          abstract: 'Some abstract text.',
          submittedAt: null,
          metadataSource: null,
        }));
        updateProcessingState = updateProcessingState;
        updateMetadata = vi.fn().mockResolvedValue(undefined);
        replaceChunks = vi.fn().mockResolvedValue(undefined);
        listChunkIdsForPaper = vi.fn().mockResolvedValue([]);
        listPendingSemanticPaperIds = vi.fn().mockResolvedValue([]);
      }
      class PaperEmbeddingRepository {}
      return { PapersRepository, PaperEmbeddingRepository };
    });
    vi.doMock('../../src/main/store/app-settings-store', () => ({
      getSemanticSearchSettings: vi.fn(() => ({
        enabled: true,
        autoProcess: true,
        autoStartOllama: true,
        baseUrl: 'http://127.0.0.1:11434',
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingProvider: 'builtin',
      })),
    }));
    vi.doMock('../../src/main/services/search-unit-sync.service', () => ({
      rebuildSearchUnitsForPaper: vi.fn().mockRejectedValue(new Error('embedding failed')),
    }));

    const { retryPaperProcessing } =
      await import('../../src/main/services/paper-processing.service');

    await retryPaperProcessing('paper-a');

    await waitFor(() =>
      expect(updateProcessingState).toHaveBeenCalledWith(
        'paper-a',
        expect.objectContaining({
          processingStatus: 'failed',
          processingError: 'embedding failed',
        }),
      ),
    );
  });

  it('schedulePaperProcessing is a no-op', async () => {
    vi.doMock('electron', () => ({
      BrowserWindow: { getAllWindows: () => [] },
    }));
    vi.doMock('@db', () => {
      class PapersRepository {}
      class PaperEmbeddingRepository {}
      return { PapersRepository, PaperEmbeddingRepository };
    });
    vi.doMock('../../src/main/store/app-settings-store', () => ({
      getSemanticSearchSettings: vi.fn(() => ({ enabled: true })),
    }));
    vi.doMock('../../src/main/services/search-unit-sync.service', () => ({
      rebuildSearchUnitsForPaper: vi.fn(),
    }));

    const { schedulePaperProcessing } =
      await import('../../src/main/services/paper-processing.service');

    // Should not throw
    schedulePaperProcessing('paper-a');
  });
});
