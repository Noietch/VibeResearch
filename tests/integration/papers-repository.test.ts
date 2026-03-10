/**
 * Production-grade integration tests for PapersRepository
 *
 * Tests cover:
 *  - CRUD lifecycle (create, find, update, delete)
 *  - Tag management (flat tags, categorized tags, update/replace)
 *  - Filtering: by year, by tag, by import time, by text query
 *  - Metadata updates (title, authors, abstract, rating)
 *  - Processing state management
 *  - Short-ID prefix counting
 *  - Bulk delete
 *  - Semantic index summary
 *  - lastReadAt touch
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDatabase, ensureTestDatabaseSchema, resetTestDatabase } from '../support/test-db';
import { PapersRepository } from '../../src/db/repositories/papers.repository';

// Mock vec-client to avoid sqlite-vec dependency in tests
vi.mock('../../src/db/vec-client', () => ({
  getVecDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []), get: vi.fn() })),
    transaction: vi.fn((fn: Function) => fn),
  })),
  closeVecDb: vi.fn(),
}));

describe('PapersRepository', () => {
  ensureTestDatabaseSchema();

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function createPaper(overrides: Partial<Parameters<PapersRepository['create']>[0]> = {}) {
    const repo = new PapersRepository();
    return repo.create({
      shortId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: 'Default Test Paper',
      authors: ['Alice', 'Bob'],
      source: 'manual',
      tags: ['test'],
      ...overrides,
    });
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a paper with all basic fields', async () => {
      const repo = new PapersRepository();
      const paper = await repo.create({
        shortId: '2501.12345',
        title: 'Attention Is All You Need',
        authors: ['Vaswani', 'Shazeer'],
        source: 'arxiv',
        sourceUrl: 'https://arxiv.org/abs/1706.03762',
        submittedAt: new Date('2017-06-12T00:00:00Z'),
        abstract: 'We propose the Transformer architecture.',
        tags: ['transformer', 'nlp'],
      });

      expect(paper.id).toBeDefined();
      expect(paper.shortId).toBe('2501.12345');
      expect(paper.title).toBe('Attention Is All You Need');
      expect(paper.authors).toEqual(['Vaswani', 'Shazeer']);
      expect(paper.source).toBe('arxiv');
      expect(paper.tagNames).toContain('transformer');
      expect(paper.tagNames).toContain('nlp');
      expect(paper.categorizedTags.length).toBe(2);
    });

    it('creates a paper with categorized tags', async () => {
      const repo = new PapersRepository();
      const paper = await repo.create({
        shortId: 'local-001',
        title: 'A Vision Paper',
        authors: ['Carol'],
        source: 'manual',
        tags: [],
        categorizedTags: [
          { name: 'computer-vision', category: 'domain' },
          { name: 'resnet', category: 'method' },
          { name: 'classification', category: 'topic' },
        ],
      });

      const domainTag = paper.categorizedTags.find((t) => t.name === 'computer-vision');
      const methodTag = paper.categorizedTags.find((t) => t.name === 'resnet');
      const topicTag = paper.categorizedTags.find((t) => t.name === 'classification');

      expect(domainTag?.category).toBe('domain');
      expect(methodTag?.category).toBe('method');
      expect(topicTag?.category).toBe('topic');
    });

    it('creates paper with no tags', async () => {
      const repo = new PapersRepository();
      const paper = await repo.create({
        shortId: 'local-002',
        title: 'Tagless Paper',
        authors: [],
        source: 'manual',
        tags: [],
      });

      expect(paper.tagNames).toHaveLength(0);
      expect(paper.categorizedTags).toHaveLength(0);
    });

    it('upserts tags that already exist (no duplicate tag rows)', async () => {
      const repo = new PapersRepository();

      // Create two papers with the same tag
      await repo.create({
        shortId: 'local-003',
        title: 'Paper A',
        authors: [],
        source: 'manual',
        tags: ['shared-tag'],
      });

      await repo.create({
        shortId: 'local-004',
        title: 'Paper B',
        authors: [],
        source: 'manual',
        tags: ['shared-tag'],
      });

      const allTags = await repo.listAllTags();
      const sharedTagCount = allTags.filter((t) => t === 'shared-tag').length;
      expect(sharedTagCount).toBe(1); // Only one tag record
    });
  });

  // ── Find ───────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns paper by id', async () => {
      const paper = await createPaper({ title: 'Find Me By ID' });
      const repo = new PapersRepository();

      const found = await repo.findById(paper.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Find Me By ID');
    });

    it('returns null for non-existent id', async () => {
      const repo = new PapersRepository();
      const found = await repo.findById('non-existent-uuid');
      expect(found).toBeNull();
    });
  });

  describe('findByShortId', () => {
    it('returns paper by shortId', async () => {
      const repo = new PapersRepository();
      const paper = await repo.create({
        shortId: 'test-short-001',
        title: 'Find Me By Short ID',
        authors: [],
        source: 'manual',
        tags: [],
      });

      const found = await repo.findByShortId('test-short-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(paper.id);
    });

    it('returns null for non-existent shortId', async () => {
      const repo = new PapersRepository();
      const found = await repo.findByShortId('no-such-short-id');
      expect(found).toBeNull();
    });
  });

  // ── List ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all papers when no filter', async () => {
      const repo = new PapersRepository();
      await createPaper({ title: 'Paper One' });
      await createPaper({ title: 'Paper Two' });
      await createPaper({ title: 'Paper Three' });

      const papers = await repo.list({});
      expect(papers.length).toBe(3);
    });

    it('filters by year', async () => {
      const repo = new PapersRepository();
      await repo.create({
        shortId: 'local-y2022',
        title: '2022 Paper',
        authors: [],
        source: 'manual',
        tags: [],
        submittedAt: new Date('2022-06-01T00:00:00Z'),
      });

      await repo.create({
        shortId: 'local-y2023',
        title: '2023 Paper',
        authors: [],
        source: 'manual',
        tags: [],
        submittedAt: new Date('2023-06-01T00:00:00Z'),
      });

      const papers2022 = await repo.list({ year: 2022 });
      expect(papers2022.length).toBe(1);
      expect(papers2022[0].title).toBe('2022 Paper');

      const papers2023 = await repo.list({ year: 2023 });
      expect(papers2023.length).toBe(1);
      expect(papers2023[0].title).toBe('2023 Paper');
    });

    it('filters by tag', async () => {
      const repo = new PapersRepository();
      await repo.create({
        shortId: 'local-ta',
        title: 'Robotics Paper',
        authors: [],
        source: 'manual',
        tags: ['robotics', 'control'],
      });

      await repo.create({
        shortId: 'local-tb',
        title: 'NLP Paper',
        authors: [],
        source: 'manual',
        tags: ['nlp', 'bert'],
      });

      const roboticsPapers = await repo.list({ tag: 'robotics' });
      expect(roboticsPapers.length).toBe(1);
      expect(roboticsPapers[0].title).toBe('Robotics Paper');

      const nlpPapers = await repo.list({ tag: 'nlp' });
      expect(nlpPapers.length).toBe(1);
      expect(nlpPapers[0].title).toBe('NLP Paper');
    });

    it('filters by text query (title match)', async () => {
      const repo = new PapersRepository();
      await repo.create({
        shortId: 'local-q1',
        title: 'Attention Is All You Need',
        authors: [],
        source: 'manual',
        tags: [],
      });

      await repo.create({
        shortId: 'local-q2',
        title: 'BERT Pre-training',
        authors: [],
        source: 'manual',
        tags: [],
      });

      const results = await repo.list({ q: 'attention' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Attention Is All You Need');
    });

    it('filters by text query (tag match)', async () => {
      const repo = new PapersRepository();
      await repo.create({
        shortId: 'local-qt',
        title: 'Some Paper',
        authors: [],
        source: 'manual',
        tags: ['diffusion-model'],
      });

      const results = await repo.list({ q: 'diffusion-model' });
      expect(results.length).toBe(1);
    });

    it('returns empty list when no papers exist', async () => {
      const repo = new PapersRepository();
      const papers = await repo.list({});
      expect(papers).toHaveLength(0);
    });

    it('returns papers ordered by lastReadAt desc, then createdAt desc', async () => {
      const repo = new PapersRepository();
      const p1 = await createPaper({ title: 'Oldest' });
      const p2 = await createPaper({ title: 'Newest' });

      // Touch p1 as recently read
      await repo.touchLastRead(p1.id);

      const papers = await repo.list({});
      expect(papers[0].id).toBe(p1.id); // most recently read first
    });
  });

  // ── Update ─────────────────────────────────────────────────────────────────

  describe('updateTags', () => {
    it('replaces tags on a paper', async () => {
      const paper = await createPaper({ tags: ['old-tag-1', 'old-tag-2'] });
      const repo = new PapersRepository();

      const updated = await repo.updateTags(paper.id, ['new-tag-1', 'new-tag-2', 'new-tag-3']);
      expect(updated!.tagNames).not.toContain('old-tag-1');
      expect(updated!.tagNames).not.toContain('old-tag-2');
      expect(updated!.tagNames).toContain('new-tag-1');
      expect(updated!.tagNames).toContain('new-tag-2');
      expect(updated!.tagNames).toContain('new-tag-3');
    });

    it('removes all tags when given empty array', async () => {
      const paper = await createPaper({ tags: ['some-tag'] });
      const repo = new PapersRepository();

      const updated = await repo.updateTags(paper.id, []);
      expect(updated!.tagNames).toHaveLength(0);
    });
  });

  describe('updateTagsWithCategories', () => {
    it('replaces tags with categorized versions', async () => {
      const paper = await createPaper({ tags: ['old'] });
      const repo = new PapersRepository();

      const updated = await repo.updateTagsWithCategories(paper.id, [
        { name: 'nlp', category: 'domain' },
        { name: 'bert', category: 'method' },
      ]);

      const nlpTag = updated!.categorizedTags.find((t) => t.name === 'nlp');
      const bertTag = updated!.categorizedTags.find((t) => t.name === 'bert');

      expect(nlpTag?.category).toBe('domain');
      expect(bertTag?.category).toBe('method');
      expect(updated!.tagNames).not.toContain('old');
    });
  });

  describe('updateMetadata', () => {
    it('updates title', async () => {
      const paper = await createPaper({ title: 'Original Title' });
      const repo = new PapersRepository();

      const updated = await repo.updateMetadata(paper.id, { title: 'Updated Title' });
      expect(updated.title).toBe('Updated Title');
    });

    it('updates authors', async () => {
      const paper = await createPaper({ authors: ['Alice'] });
      const repo = new PapersRepository();

      const updated = await repo.updateMetadata(paper.id, { authors: ['Alice', 'Bob', 'Carol'] });
      expect(updated.authors).toEqual(['Alice', 'Bob', 'Carol']);
    });

    it('updates abstract', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      const updated = await repo.updateMetadata(paper.id, {
        abstract: 'A new abstract for testing.',
      });
      expect(updated.abstract).toBe('A new abstract for testing.');
    });

    it('updates submittedAt', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();
      const newDate = new Date('2024-01-01T00:00:00Z');

      const updated = await repo.updateMetadata(paper.id, { submittedAt: newDate });
      expect(new Date(updated.submittedAt!).getFullYear()).toBe(2024);
    });

    it('clears submittedAt when null passed', async () => {
      const paper = await createPaper({
        submittedAt: new Date('2023-01-01T00:00:00Z'),
      });
      const repo = new PapersRepository();

      const updated = await repo.updateMetadata(paper.id, { submittedAt: null });
      expect(updated.submittedAt).toBeNull();
    });
  });

  describe('updateRating', () => {
    it('sets a numeric rating', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      const updated = await repo.updateRating(paper.id, 5);
      expect(updated.rating).toBe(5);
    });

    it('clears rating when null', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      await repo.updateRating(paper.id, 3);
      const cleared = await repo.updateRating(paper.id, null);
      expect(cleared.rating).toBeNull();
    });
  });

  describe('updateTitle', () => {
    it('updates only the title', async () => {
      const paper = await createPaper({ title: 'Old Title', authors: ['Alice'] });
      const repo = new PapersRepository();

      await repo.updateTitle(paper.id, 'New Title');
      const found = await repo.findById(paper.id);
      expect(found!.title).toBe('New Title');
      expect(found!.authors).toEqual(['Alice']); // unchanged
    });
  });

  describe('touchLastRead', () => {
    it('sets lastReadAt to current time', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      const before = Date.now();
      await repo.touchLastRead(paper.id);
      const after = Date.now();

      const found = await repo.findById(paper.id);
      const lastRead = new Date(found!.lastReadAt!).getTime();
      expect(lastRead).toBeGreaterThanOrEqual(before);
      expect(lastRead).toBeLessThanOrEqual(after);
    });
  });

  describe('updatePdfPath', () => {
    it('sets pdf path', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      await repo.updatePdfPath(paper.id, '/path/to/file.pdf');
      const found = await repo.findById(paper.id);
      expect(found!.pdfPath).toBe('/path/to/file.pdf');
    });

    it('clears pdf path when null', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      await repo.updatePdfPath(paper.id, '/some/path.pdf');
      await repo.updatePdfPath(paper.id, null);
      const found = await repo.findById(paper.id);
      expect(found!.pdfPath).toBeNull();
    });
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes paper from database', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      await repo.delete(paper.id);
      const found = await repo.findById(paper.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteMany', () => {
    it('deletes multiple papers by ids', async () => {
      const repo = new PapersRepository();
      const p1 = await createPaper({ title: 'Delete Me 1' });
      const p2 = await createPaper({ title: 'Delete Me 2' });
      const p3 = await createPaper({ title: 'Keep Me' });

      const count = await repo.deleteMany([p1.id, p2.id]);
      expect(count).toBe(2);

      const remaining = await repo.list({});
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(p3.id);
    });

    it('returns 0 for empty array', async () => {
      const repo = new PapersRepository();
      const count = await repo.deleteMany([]);
      expect(count).toBe(0);
    });

    it('handles non-existent ids gracefully', async () => {
      const repo = new PapersRepository();
      const count = await repo.deleteMany(['non-existent-1', 'non-existent-2']);
      expect(count).toBe(0);
    });
  });

  // ── Counting ───────────────────────────────────────────────────────────────

  describe('countByShortIdPrefix', () => {
    it('counts papers with given prefix', async () => {
      const repo = new PapersRepository();
      await repo.create({
        shortId: 'local-001',
        title: 'Local Paper 1',
        authors: [],
        source: 'manual',
        tags: [],
      });
      await repo.create({
        shortId: 'local-002',
        title: 'Local Paper 2',
        authors: [],
        source: 'manual',
        tags: [],
      });
      await repo.create({
        shortId: '1706.03762',
        title: 'ArXiv Paper',
        authors: [],
        source: 'arxiv',
        tags: [],
      });

      const localCount = await repo.countByShortIdPrefix('local-');
      expect(localCount).toBe(2);

      const arxivCount = await repo.countByShortIdPrefix('1706');
      expect(arxivCount).toBe(1);

      const noneCount = await repo.countByShortIdPrefix('no-match-');
      expect(noneCount).toBe(0);
    });
  });

  // ── Tag listing ────────────────────────────────────────────────────────────

  describe('listAllTags', () => {
    it('returns all unique tag names sorted alphabetically', async () => {
      const repo = new PapersRepository();
      await createPaper({ tags: ['nlp', 'transformer'] });
      await createPaper({ tags: ['nlp', 'diffusion'] });

      const tags = await repo.listAllTags();
      expect(tags).toContain('nlp');
      expect(tags).toContain('transformer');
      expect(tags).toContain('diffusion');
      // Should be sorted
      const sortedTags = [...tags].sort();
      expect(tags).toEqual(sortedTags);
    });

    it('returns empty array when no papers', async () => {
      const repo = new PapersRepository();
      const tags = await repo.listAllTags();
      expect(tags).toHaveLength(0);
    });
  });

  // ── listAll / listAllShortIds ──────────────────────────────────────────────

  describe('listAll', () => {
    it('returns minimal paper info for all papers', async () => {
      const repo = new PapersRepository();
      await repo.create({
        shortId: 'all-001',
        title: 'Paper A',
        authors: [],
        source: 'manual',
        tags: [],
      });
      await repo.create({
        shortId: 'all-002',
        title: 'Paper B',
        authors: [],
        source: 'manual',
        tags: [],
      });

      const all = await repo.listAll();
      expect(all.length).toBe(2);
      // Each should have minimal fields
      for (const p of all) {
        expect(p.id).toBeDefined();
        expect(p.shortId).toBeDefined();
        expect(p.title).toBeDefined();
      }
    });
  });

  describe('listAllShortIds', () => {
    it('returns a Set of all shortIds', async () => {
      const repo = new PapersRepository();
      await repo.create({
        shortId: 'sid-001',
        title: 'Paper A',
        authors: [],
        source: 'manual',
        tags: [],
      });
      await repo.create({
        shortId: 'sid-002',
        title: 'Paper B',
        authors: [],
        source: 'manual',
        tags: [],
      });

      const ids = await repo.listAllShortIds();
      expect(ids).toBeInstanceOf(Set);
      expect(ids.has('sid-001')).toBe(true);
      expect(ids.has('sid-002')).toBe(true);
      expect(ids.has('sid-999')).toBe(false);
    });
  });

  // ── Processing state ───────────────────────────────────────────────────────

  describe('updateProcessingState', () => {
    it('updates processing status', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      await repo.updateProcessingState(paper.id, { processingStatus: 'processing' });
      const found = await repo.findById(paper.id);
      expect(found!.processingStatus).toBe('processing');
    });

    it('marks paper as failed with error message', async () => {
      const paper = await createPaper({});
      const repo = new PapersRepository();

      await repo.updateProcessingState(paper.id, {
        processingStatus: 'failed',
        processingError: 'PDF download failed: 404',
      });

      const found = await repo.findById(paper.id);
      expect(found!.processingStatus).toBe('failed');
      expect(found!.processingError).toBe('PDF download failed: 404');
    });
  });

  describe('getSemanticIndexDebugSummary', () => {
    it('returns correct counts for mixed paper states', async () => {
      const repo = new PapersRepository();

      // Create a manual paper (no pdfUrl/pdfPath, not arxiv) — not pending
      await repo.create({
        shortId: 'sum-manual',
        title: 'Manual Paper',
        authors: [],
        source: 'manual',
        tags: [],
      });

      // Create an arxiv paper — pending (has source=arxiv)
      await repo.create({
        shortId: 'sum-arxiv',
        title: 'ArXiv Paper',
        authors: [],
        source: 'arxiv',
        tags: [],
      });

      const summary = await repo.getSemanticIndexDebugSummary();

      expect(summary.totalPapers).toBe(2);
      expect(summary.indexedPapers).toBe(0);
      expect(summary.pendingPapers).toBe(1); // only arxiv paper
      expect(summary.failedPapers).toBe(0);
      expect(summary.totalChunks).toBe(0);
      expect(Array.isArray(summary.recentFailures)).toBe(true);
    });
  });

  // ── Untagged paper queries ─────────────────────────────────────────────────

  describe('listUntaggedPaperIds', () => {
    it('returns only papers with no tags', async () => {
      const repo = new PapersRepository();
      const tagged = await createPaper({ tags: ['some-tag'] });
      const untagged1 = await createPaper({ tags: [] });
      const untagged2 = await createPaper({ tags: [] });

      const untaggedIds = await repo.listUntaggedPaperIds();
      expect(untaggedIds).toContain(untagged1.id);
      expect(untaggedIds).toContain(untagged2.id);
      expect(untaggedIds).not.toContain(tagged.id);
    });

    it('returns empty array when all papers have tags', async () => {
      const repo = new PapersRepository();
      await createPaper({ tags: ['tag-a'] });
      await createPaper({ tags: ['tag-b'] });

      const untaggedIds = await repo.listUntaggedPaperIds();
      expect(untaggedIds).toHaveLength(0);
    });
  });
});
