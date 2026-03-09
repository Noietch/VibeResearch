import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDatabase, ensureTestDatabaseSchema, resetTestDatabase } from '../support/test-db';
import { CitationsRepository } from '../../src/db/repositories/citations.repository';
import { CitationGraphService } from '../../src/main/services/citation-graph.service';
import { PapersService } from '../../src/main/services/papers.service';

// Mock vec-client to avoid sqlite-vec dependency in tests
vi.mock('../../src/db/vec-client', () => ({
  getVecDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []), get: vi.fn() })),
  })),
  closeVecDb: vi.fn(),
}));

describe('citations integration', () => {
  ensureTestDatabaseSchema();

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  async function createPaper(title: string, sourceUrl?: string) {
    const papersService = new PapersService();
    return papersService.create({
      title,
      source: 'arxiv',
      sourceUrl,
      tags: ['ml'],
      authors: ['Alice', 'Bob'],
    });
  }

  describe('Citation CRUD', () => {
    it('creates citations and queries by source', async () => {
      const repo = new CitationsRepository();
      const p1 = await createPaper('Paper A');
      const p2 = await createPaper('Paper B');

      await repo.createMany([
        {
          sourcePaperId: p1.id,
          targetPaperId: p2.id,
          externalId: 's2:abc123',
          externalTitle: 'Paper B',
          citationType: 'reference',
        },
      ]);

      const refs = await repo.findBySource(p1.id);
      expect(refs.length).toBe(1);
      expect(refs[0].targetPaperId).toBe(p2.id);
      expect(refs[0].externalTitle).toBe('Paper B');
    });

    it('creates citations and queries by target', async () => {
      const repo = new CitationsRepository();
      const p1 = await createPaper('Paper A');
      const p2 = await createPaper('Paper B');

      await repo.createMany([
        {
          sourcePaperId: p1.id,
          targetPaperId: p2.id,
          externalId: 's2:abc123',
        },
      ]);

      const cited = await repo.findByTarget(p2.id);
      expect(cited.length).toBe(1);
      expect(cited[0].sourcePaperId).toBe(p1.id);
    });

    it('upserts on duplicate sourcePaperId+externalId', async () => {
      const repo = new CitationsRepository();
      const p1 = await createPaper('Paper A');
      const p2 = await createPaper('Paper B');

      await repo.createMany([
        { sourcePaperId: p1.id, externalId: 's2:dup', externalTitle: 'Old Title' },
      ]);

      await repo.createMany([
        {
          sourcePaperId: p1.id,
          externalId: 's2:dup',
          targetPaperId: p2.id,
          externalTitle: 'Old Title',
        },
      ]);

      const refs = await repo.findBySource(p1.id);
      expect(refs.length).toBe(1);
      expect(refs[0].targetPaperId).toBe(p2.id);
    });

    it('counts references and citedBy', async () => {
      const repo = new CitationsRepository();
      const p1 = await createPaper('Paper A');
      const p2 = await createPaper('Paper B');
      const p3 = await createPaper('Paper C');

      await repo.createMany([
        { sourcePaperId: p1.id, targetPaperId: p2.id, externalId: 'r1' },
        { sourcePaperId: p1.id, targetPaperId: p3.id, externalId: 'r2' },
        { sourcePaperId: p3.id, targetPaperId: p2.id, externalId: 'r3' },
      ]);

      expect(await repo.countBySource(p1.id)).toBe(2);
      expect(await repo.countByTarget(p2.id)).toBe(2);
      expect(await repo.countBySource(p2.id)).toBe(0);
    });
  });

  describe('Graph data assembly', () => {
    it('assembles graph from 5 papers and 8 edges', async () => {
      const repo = new CitationsRepository();
      const graphService = new CitationGraphService();

      const papers = [];
      for (let i = 0; i < 5; i++) {
        papers.push(await createPaper(`Paper ${i}`));
      }

      // Create a citation network
      const citationEdges = [
        { s: 0, t: 1 },
        { s: 0, t: 2 },
        { s: 1, t: 2 },
        { s: 1, t: 3 },
        { s: 2, t: 3 },
        { s: 2, t: 4 },
        { s: 3, t: 4 },
        { s: 4, t: 0 },
      ];

      await repo.createMany(
        citationEdges.map((e, i) => ({
          sourcePaperId: papers[e.s].id,
          targetPaperId: papers[e.t].id,
          externalId: `edge-${i}`,
          citationType: 'reference',
        })),
      );

      const graph = await graphService.getGraphData({ includeGhostNodes: false });

      expect(graph.stats.totalNodes).toBe(5);
      expect(graph.stats.totalEdges).toBe(8);
      expect(graph.stats.connectedComponents).toBe(1);

      // All nodes should be in library
      expect(graph.nodes.every((n) => n.isInLibrary)).toBe(true);

      // Verify node structure
      const node0 = graph.nodes.find((n) => n.id === papers[0].id);
      expect(node0).toBeDefined();
      expect(node0!.title).toBe('Paper 0');
      expect(node0!.authors).toContain('Alice');
    });

    it('includes ghost nodes for unmatched references', async () => {
      const repo = new CitationsRepository();
      const graphService = new CitationGraphService();

      const p1 = await createPaper('Paper A');

      await repo.createMany([
        {
          sourcePaperId: p1.id,
          externalId: 'ghost-1',
          externalTitle: 'External Paper',
          citationType: 'reference',
        },
      ]);

      const graph = await graphService.getGraphData({ includeGhostNodes: true });
      expect(graph.nodes.length).toBe(2);
      const ghostNode = graph.nodes.find((n) => !n.isInLibrary);
      expect(ghostNode).toBeDefined();
      expect(ghostNode!.title).toBe('External Paper');

      // Without ghost nodes
      const noGhost = await graphService.getGraphData({ includeGhostNodes: false });
      expect(noGhost.nodes.length).toBe(1);
    });
  });

  describe('PageRank', () => {
    it('computes PageRank with known topology', async () => {
      const graphService = new CitationGraphService();

      // Simple chain: A -> B -> C
      const nodes = [
        {
          id: 'A',
          shortId: 'a',
          title: 'A',
          authors: [],
          tags: [],
          citationCount: 0,
          referenceCount: 1,
          isInLibrary: true,
        },
        {
          id: 'B',
          shortId: 'b',
          title: 'B',
          authors: [],
          tags: [],
          citationCount: 1,
          referenceCount: 1,
          isInLibrary: true,
        },
        {
          id: 'C',
          shortId: 'c',
          title: 'C',
          authors: [],
          tags: [],
          citationCount: 1,
          referenceCount: 0,
          isInLibrary: true,
        },
      ];

      const edges = [
        { id: 'e1', source: 'A', target: 'B', confidence: 1 },
        { id: 'e2', source: 'B', target: 'C', confidence: 1 },
      ];

      const ranks = graphService.computePageRank(nodes, edges);

      // C should have higher rank than A (it receives but doesn't give)
      expect(ranks.get('C')!).toBeGreaterThan(ranks.get('A')!);

      // All ranks should be positive
      for (const [, rank] of ranks) {
        expect(rank).toBeGreaterThan(0);
      }
    });

    it('returns empty map for no nodes', () => {
      const graphService = new CitationGraphService();
      const ranks = graphService.computePageRank([], []);
      expect(ranks.size).toBe(0);
    });
  });

  describe('BFS path finding', () => {
    it('finds shortest path A→B→C', async () => {
      const repo = new CitationsRepository();
      const graphService = new CitationGraphService();

      const pA = await createPaper('Paper A');
      const pB = await createPaper('Paper B');
      const pC = await createPaper('Paper C');

      await repo.createMany([
        { sourcePaperId: pA.id, targetPaperId: pB.id, externalId: 'p1' },
        { sourcePaperId: pB.id, targetPaperId: pC.id, externalId: 'p2' },
      ]);

      const path = await graphService.findCitationPath(pA.id, pC.id);
      expect(path).not.toBeNull();
      expect(path!.length).toBe(3);
      expect(path![0]).toBe(pA.id);
      expect(path![1]).toBe(pB.id);
      expect(path![2]).toBe(pC.id);
    });

    it('returns null when no path exists', async () => {
      const repo = new CitationsRepository();
      const graphService = new CitationGraphService();

      const pA = await createPaper('Paper A');
      const pB = await createPaper('Paper B');
      const pC = await createPaper('Paper C');

      // Only A->B, no connection to C
      await repo.createMany([{ sourcePaperId: pA.id, targetPaperId: pB.id, externalId: 'p1' }]);

      const path = await graphService.findCitationPath(pA.id, pC.id);
      expect(path).toBeNull();
    });
  });

  describe('Cascade delete', () => {
    it('deletes citations when paper is deleted', async () => {
      const repo = new CitationsRepository();
      const papersService = new PapersService();

      const p1 = await createPaper('Paper A');
      const p2 = await createPaper('Paper B');

      await repo.createMany([{ sourcePaperId: p1.id, targetPaperId: p2.id, externalId: 'c1' }]);

      // Delete source paper - citations from it should be gone
      await papersService.deleteById(p1.id);

      const refs = await repo.findByTarget(p2.id);
      expect(refs.length).toBe(0);
    });

    it('sets targetPaperId to null when target paper is deleted', async () => {
      const repo = new CitationsRepository();
      const papersService = new PapersService();

      const p1 = await createPaper('Paper A');
      const p2 = await createPaper('Paper B');

      await repo.createMany([{ sourcePaperId: p1.id, targetPaperId: p2.id, externalId: 'c1' }]);

      // Delete target paper - citation should remain but targetPaperId = null
      await papersService.deleteById(p2.id);

      const refs = await repo.findBySource(p1.id);
      expect(refs.length).toBe(1);
      expect(refs[0].targetPaperId).toBeNull();
    });
  });

  describe('Unmatched resolution', () => {
    it('resolves unmatched citations when matching paper is added', async () => {
      const repo = new CitationsRepository();

      const p1 = await createPaper('Paper A');

      // Create unmatched citation
      await repo.createMany([
        {
          sourcePaperId: p1.id,
          targetPaperId: null,
          externalTitle: 'Attention Is All You Need',
          externalId: 's2:unmatched',
        },
      ]);

      // Verify it's unresolved
      let unresolved = await repo.findUnresolved();
      expect(unresolved.length).toBe(1);

      // Add the matching paper
      const p2 = await createPaper('Attention Is All You Need');

      // Manually resolve
      const localPapers = await repo.getAllLocalPaperTitles();
      for (const cit of unresolved) {
        if (!cit.externalTitle) continue;
        const match = localPapers.find((p) => {
          const normalize = (s: string) =>
            s
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, '')
              .trim();
          return normalize(p.title) === normalize(cit.externalTitle!);
        });
        if (match) {
          await repo.resolveByTitle(cit.id, match.id);
        }
      }

      // Verify resolved
      unresolved = await repo.findUnresolved();
      expect(unresolved.length).toBe(0);

      const refs = await repo.findBySource(p1.id);
      expect(refs[0].targetPaperId).toBe(p2.id);
    });
  });

  describe('Full chain: import papers → extract citations → view graph', () => {
    it('creates papers simulating Chrome history, adds citations, builds graph', async () => {
      const repo = new CitationsRepository();
      const graphService = new CitationGraphService();

      // Simulate Chrome history import: create research papers
      const attention = await createPaper(
        'Attention Is All You Need',
        'https://arxiv.org/abs/1706.03762',
      );
      const bert = await createPaper(
        'BERT: Pre-training of Deep Bidirectional Transformers',
        'https://arxiv.org/abs/1810.04805',
      );
      const gpt = await createPaper(
        'Language Models are Unsupervised Multitask Learners',
        'https://arxiv.org/abs/1901.02860',
      );

      // Create citation relationships (BERT and GPT cite Attention)
      await repo.createMany([
        {
          sourcePaperId: bert.id,
          targetPaperId: attention.id,
          externalId: 'ArXiv:1706.03762',
          externalTitle: 'Attention Is All You Need',
          citationType: 'reference',
        },
        {
          sourcePaperId: gpt.id,
          targetPaperId: attention.id,
          externalId: 'ArXiv:1706.03762-gpt',
          externalTitle: 'Attention Is All You Need',
          citationType: 'reference',
        },
        {
          sourcePaperId: gpt.id,
          targetPaperId: bert.id,
          externalId: 'ArXiv:1810.04805',
          externalTitle: 'BERT',
          citationType: 'reference',
        },
        // Unmatched reference
        {
          sourcePaperId: bert.id,
          externalId: 's2:external1',
          externalTitle: 'Some External Paper',
          citationType: 'reference',
        },
      ]);

      // Build graph
      const graph = await graphService.getGraphData({ includeGhostNodes: true });

      // 3 local papers + 1 ghost node
      expect(graph.stats.totalNodes).toBe(4);
      expect(graph.stats.totalEdges).toBe(4);

      // Attention should be the most cited
      const attentionNode = graph.nodes.find((n) => n.id === attention.id)!;
      expect(attentionNode.citationCount).toBe(2);

      // PageRank should rank attention highest among local papers
      const localNodes = graph.nodes.filter((n) => n.isInLibrary);
      const sortedByRank = [...localNodes].sort((a, b) => (b.pageRank ?? 0) - (a.pageRank ?? 0));
      expect(sortedByRank[0].id).toBe(attention.id);

      // Verify graph for single paper
      const bertGraph = await graphService.getGraphForPaper(bert.id, 1, false);
      expect(bertGraph.nodes.length).toBeGreaterThanOrEqual(2); // at least bert + attention

      // Verify path finding
      const path = await graphService.findCitationPath(gpt.id, attention.id);
      expect(path).not.toBeNull();
      expect(path!.length).toBeLessThanOrEqual(3);
    });
  });
});
