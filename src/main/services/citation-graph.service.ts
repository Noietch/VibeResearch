/**
 * Citation graph service.
 * Assembles graph data, computes PageRank, and performs BFS path finding.
 */
import { CitationsRepository } from '@db';
import type { GraphNode, GraphEdge, GraphData } from '@shared';

export class CitationGraphService {
  private citationsRepo = new CitationsRepository();

  async getGraphData(options?: { includeGhostNodes?: boolean }): Promise<GraphData> {
    const includeGhost = options?.includeGhostNodes ?? true;
    const rawCitations = await this.citationsRepo.getGraphData();
    return this.assembleGraph(rawCitations, includeGhost);
  }

  async getGraphForPaper(
    paperId: string,
    depth: number = 1,
    includeGhostNodes: boolean = true,
  ): Promise<GraphData> {
    const rawCitations = await this.citationsRepo.getGraphDataForPaper(paperId, depth);
    return this.assembleGraph(rawCitations, includeGhostNodes);
  }

  async findCitationPath(fromId: string, toId: string): Promise<string[] | null> {
    const rawCitations = await this.citationsRepo.getGraphData();

    // Build adjacency list (undirected for path finding)
    const adj = new Map<string, Set<string>>();
    for (const c of rawCitations) {
      const source = c.sourcePaperId;
      const target = c.targetPaperId;
      if (!target) continue;

      if (!adj.has(source)) adj.set(source, new Set());
      if (!adj.has(target)) adj.set(target, new Set());
      adj.get(source)!.add(target);
      adj.get(target)!.add(source);
    }

    // BFS
    const visited = new Set<string>();
    const parent = new Map<string, string | null>();
    const queue: string[] = [fromId];
    visited.add(fromId);
    parent.set(fromId, null);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === toId) {
        // Reconstruct path
        const path: string[] = [];
        let node: string | null = toId;
        while (node !== null) {
          path.unshift(node);
          node = parent.get(node) ?? null;
        }
        return path;
      }

      const neighbors = adj.get(current);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }

    return null;
  }

  computePageRank(
    nodes: GraphNode[],
    edges: GraphEdge[],
    damping: number = 0.85,
    iterations: number = 20,
  ): Map<string, number> {
    const n = nodes.length;
    if (n === 0) return new Map();

    const nodeIds = nodes.map((n) => n.id);
    const rank = new Map<string, number>();
    const outDegree = new Map<string, number>();

    // Build inbound edges map
    const inbound = new Map<string, string[]>();
    for (const id of nodeIds) {
      rank.set(id, 1 / n);
      outDegree.set(id, 0);
      inbound.set(id, []);
    }

    for (const edge of edges) {
      outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
      const inList = inbound.get(edge.target);
      if (inList) inList.push(edge.source);
    }

    // Iterate
    for (let i = 0; i < iterations; i++) {
      const newRank = new Map<string, number>();
      for (const id of nodeIds) {
        let sum = 0;
        const inList = inbound.get(id) ?? [];
        for (const src of inList) {
          const srcOut = outDegree.get(src) ?? 1;
          sum += (rank.get(src) ?? 0) / srcOut;
        }
        newRank.set(id, (1 - damping) / n + damping * sum);
      }
      for (const [k, v] of newRank) {
        rank.set(k, v);
      }
    }

    return rank;
  }

  private assembleGraph(
    rawCitations: Awaited<ReturnType<CitationsRepository['getGraphData']>>,
    includeGhost: boolean,
  ): GraphData {
    const nodesMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const edgeIds = new Set<string>();

    // Count citations per paper
    const citationCount = new Map<string, number>();
    const referenceCount = new Map<string, number>();

    for (const c of rawCitations) {
      // Track counts
      referenceCount.set(c.sourcePaperId, (referenceCount.get(c.sourcePaperId) ?? 0) + 1);
      if (c.targetPaperId) {
        citationCount.set(c.targetPaperId, (citationCount.get(c.targetPaperId) ?? 0) + 1);
      }

      // Add source paper node
      if (!nodesMap.has(c.sourcePaperId) && c.sourcePaper) {
        const sp = c.sourcePaper;
        nodesMap.set(c.sourcePaperId, {
          id: sp.id,
          shortId: sp.shortId,
          title: sp.title,
          authors: JSON.parse(sp.authorsJson) as string[],
          year: sp.submittedAt?.getFullYear(),
          tags: sp.tags.map((t) => t.tag.name),
          citationCount: 0,
          referenceCount: 0,
          isInLibrary: true,
        });
      }

      // Add target paper node
      if (c.targetPaperId && c.targetPaper && !nodesMap.has(c.targetPaperId)) {
        const tp = c.targetPaper;
        nodesMap.set(c.targetPaperId, {
          id: tp.id,
          shortId: tp.shortId,
          title: tp.title,
          authors: JSON.parse(tp.authorsJson) as string[],
          year: tp.submittedAt?.getFullYear(),
          tags: tp.tags.map((t) => t.tag.name),
          citationCount: 0,
          referenceCount: 0,
          isInLibrary: true,
        });
      }

      // Ghost node for unmatched references
      if (!c.targetPaperId && c.externalTitle && includeGhost) {
        const ghostId = `ghost:${c.externalId ?? c.externalTitle}`;
        if (!nodesMap.has(ghostId)) {
          nodesMap.set(ghostId, {
            id: ghostId,
            shortId: '',
            title: c.externalTitle,
            authors: [],
            tags: [],
            citationCount: 0,
            referenceCount: 0,
            isInLibrary: false,
          });
        }
        citationCount.set(ghostId, (citationCount.get(ghostId) ?? 0) + 1);
      }

      // Add edge
      const targetId =
        c.targetPaperId ?? (includeGhost ? `ghost:${c.externalId ?? c.externalTitle}` : null);
      if (targetId) {
        const edgeId = `${c.sourcePaperId}->${targetId}`;
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId);
          edges.push({
            id: c.id,
            source: c.sourcePaperId,
            target: targetId,
            confidence: c.confidence,
            context: c.context ?? undefined,
          });
        }
      }
    }

    // Update counts
    for (const [id, node] of nodesMap) {
      node.citationCount = citationCount.get(id) ?? 0;
      node.referenceCount = referenceCount.get(id) ?? 0;
    }

    const nodes = Array.from(nodesMap.values());

    // Compute connected components
    const connectedComponents = this.countComponents(nodes, edges);

    // Compute PageRank
    const pageRanks = this.computePageRank(nodes, edges);
    for (const node of nodes) {
      node.pageRank = pageRanks.get(node.id) ?? 0;
    }

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        connectedComponents,
      },
    };
  }

  private countComponents(nodes: GraphNode[], edges: GraphEdge[]): number {
    if (nodes.length === 0) return 0;

    const adj = new Map<string, Set<string>>();
    for (const n of nodes) {
      adj.set(n.id, new Set());
    }
    for (const e of edges) {
      adj.get(e.source)?.add(e.target);
      adj.get(e.target)?.add(e.source);
    }

    const visited = new Set<string>();
    let count = 0;

    for (const n of nodes) {
      if (visited.has(n.id)) continue;
      count++;
      const queue = [n.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const neighbor of adj.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
    }

    return count;
  }
}
