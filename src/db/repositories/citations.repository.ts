import { getPrismaClient } from '../client';

export interface CreateCitationParams {
  sourcePaperId: string;
  targetPaperId?: string | null;
  externalTitle?: string | null;
  externalId?: string | null;
  citationType?: string;
  context?: string | null;
  confidence?: number;
}

export class CitationsRepository {
  private prisma = getPrismaClient();

  async createMany(citations: CreateCitationParams[]) {
    const results = [];
    for (const c of citations) {
      const result = await this.prisma.paperCitation.upsert({
        where: {
          sourcePaperId_externalId: {
            sourcePaperId: c.sourcePaperId,
            externalId: c.externalId ?? '',
          },
        },
        create: {
          sourcePaperId: c.sourcePaperId,
          targetPaperId: c.targetPaperId ?? null,
          externalTitle: c.externalTitle ?? null,
          externalId: c.externalId ?? '',
          citationType: c.citationType ?? 'reference',
          context: c.context ?? null,
          confidence: c.confidence ?? 1.0,
        },
        update: {
          targetPaperId: c.targetPaperId ?? undefined,
          confidence: c.confidence ?? undefined,
        },
      });
      results.push(result);
    }
    return results;
  }

  async findBySource(sourcePaperId: string) {
    return this.prisma.paperCitation.findMany({
      where: { sourcePaperId },
      include: {
        targetPaper: {
          select: { id: true, shortId: true, title: true, authorsJson: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByTarget(targetPaperId: string) {
    return this.prisma.paperCitation.findMany({
      where: { targetPaperId },
      include: {
        sourcePaper: {
          select: { id: true, shortId: true, title: true, authorsJson: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGraphData() {
    const citations = await this.prisma.paperCitation.findMany({
      include: {
        sourcePaper: {
          select: {
            id: true,
            shortId: true,
            title: true,
            authorsJson: true,
            submittedAt: true,
            tags: { include: { tag: true } },
          },
        },
        targetPaper: {
          select: {
            id: true,
            shortId: true,
            title: true,
            authorsJson: true,
            submittedAt: true,
            tags: { include: { tag: true } },
          },
        },
      },
    });

    return citations;
  }

  async getGraphDataForPaper(paperId: string, depth: number = 1) {
    const visited = new Set<string>();
    const allCitations: Awaited<ReturnType<typeof this.getGraphData>> = [];
    const queue: { id: string; currentDepth: number }[] = [{ id: paperId, currentDepth: 0 }];

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (visited.has(item.id) || item.currentDepth >= depth) continue;
      visited.add(item.id);

      const outgoing = await this.prisma.paperCitation.findMany({
        where: { sourcePaperId: item.id },
        include: {
          sourcePaper: {
            select: {
              id: true,
              shortId: true,
              title: true,
              authorsJson: true,
              submittedAt: true,
              tags: { include: { tag: true } },
            },
          },
          targetPaper: {
            select: {
              id: true,
              shortId: true,
              title: true,
              authorsJson: true,
              submittedAt: true,
              tags: { include: { tag: true } },
            },
          },
        },
      });

      const incoming = await this.prisma.paperCitation.findMany({
        where: { targetPaperId: item.id },
        include: {
          sourcePaper: {
            select: {
              id: true,
              shortId: true,
              title: true,
              authorsJson: true,
              submittedAt: true,
              tags: { include: { tag: true } },
            },
          },
          targetPaper: {
            select: {
              id: true,
              shortId: true,
              title: true,
              authorsJson: true,
              submittedAt: true,
              tags: { include: { tag: true } },
            },
          },
        },
      });

      allCitations.push(...outgoing, ...incoming);

      // Add neighbors to queue for next depth level
      for (const c of outgoing) {
        if (c.targetPaperId && !visited.has(c.targetPaperId)) {
          queue.push({ id: c.targetPaperId, currentDepth: item.currentDepth + 1 });
        }
      }
      for (const c of incoming) {
        if (!visited.has(c.sourcePaperId)) {
          queue.push({ id: c.sourcePaperId, currentDepth: item.currentDepth + 1 });
        }
      }
    }

    return allCitations;
  }

  async countBySource(paperId: string) {
    return this.prisma.paperCitation.count({
      where: { sourcePaperId: paperId },
    });
  }

  async countByTarget(paperId: string) {
    return this.prisma.paperCitation.count({
      where: { targetPaperId: paperId },
    });
  }

  async deleteBySource(sourcePaperId: string) {
    return this.prisma.paperCitation.deleteMany({
      where: { sourcePaperId },
    });
  }

  async findUnresolved() {
    return this.prisma.paperCitation.findMany({
      where: {
        targetPaperId: null,
        externalTitle: { not: null },
      },
    });
  }

  async resolveByTitle(citationId: string, targetPaperId: string) {
    return this.prisma.paperCitation.update({
      where: { id: citationId },
      data: { targetPaperId },
    });
  }

  async getAllLocalPaperTitles() {
    const papers = await this.prisma.paper.findMany({
      select: { id: true, title: true, shortId: true, sourceUrl: true },
    });
    return papers;
  }
}
