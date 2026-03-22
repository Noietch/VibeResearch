import { getPrismaClient } from '../client';

export class HighlightsRepository {
  private prisma = getPrismaClient();

  async create(params: {
    paperId: string;
    pageNumber: number;
    rectsJson: string;
    text: string;
    note?: string;
    color?: string;
  }) {
    return this.prisma.paperHighlight.create({
      data: {
        paperId: params.paperId,
        pageNumber: params.pageNumber,
        rectsJson: params.rectsJson,
        text: params.text,
        note: params.note,
        color: params.color ?? 'yellow',
      },
    });
  }

  async update(id: string, params: { note?: string; color?: string }) {
    return this.prisma.paperHighlight.update({
      where: { id },
      data: params,
    });
  }

  async delete(id: string) {
    return this.prisma.paperHighlight.delete({ where: { id } });
  }

  async listByPaper(paperId: string) {
    return this.prisma.paperHighlight.findMany({
      where: { paperId },
      orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async search(params?: { query?: string; color?: string; limit?: number; offset?: number }) {
    const conditions: Record<string, unknown>[] = [];
    if (params?.query) {
      conditions.push({ text: { contains: params.query } });
    }
    if (params?.color) {
      conditions.push({ color: params.color });
    }

    return this.prisma.paperHighlight.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      include: {
        paper: { select: { id: true, shortId: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: params?.limit ?? 100,
      skip: params?.offset ?? 0,
    });
  }
}
