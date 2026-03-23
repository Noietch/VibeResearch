import { getPrismaClient } from '../client';

export interface HighlightNoteEntry {
  id: string;
  text: string;
  createdAt: string;
}

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

  async update(
    id: string,
    params: { note?: string; aiNote?: string; notes?: string; color?: string },
  ) {
    return this.prisma.paperHighlight.update({
      where: { id },
      data: params,
    });
  }

  /** Add a note entry to the notes JSON array */
  async addNote(
    id: string,
    text: string,
  ): Promise<ReturnType<typeof this.prisma.paperHighlight.update>> {
    const highlight = await this.prisma.paperHighlight.findUniqueOrThrow({ where: { id } });
    const existing: HighlightNoteEntry[] = JSON.parse(highlight.notes || '[]');
    const entry: HighlightNoteEntry = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
    };
    existing.push(entry);
    return this.prisma.paperHighlight.update({
      where: { id },
      data: { notes: JSON.stringify(existing) },
    });
  }

  /** Update a specific note entry in the notes JSON array */
  async updateNote(id: string, noteId: string, text: string) {
    const highlight = await this.prisma.paperHighlight.findUniqueOrThrow({ where: { id } });
    const existing: HighlightNoteEntry[] = JSON.parse(highlight.notes || '[]');
    const idx = existing.findIndex((n) => n.id === noteId);
    if (idx === -1) throw new Error('Note not found');
    existing[idx].text = text;
    return this.prisma.paperHighlight.update({
      where: { id },
      data: { notes: JSON.stringify(existing) },
    });
  }

  /** Delete a specific note entry from the notes JSON array */
  async deleteNote(id: string, noteId: string) {
    const highlight = await this.prisma.paperHighlight.findUniqueOrThrow({ where: { id } });
    const existing: HighlightNoteEntry[] = JSON.parse(highlight.notes || '[]');
    const filtered = existing.filter((n) => n.id !== noteId);
    return this.prisma.paperHighlight.update({
      where: { id },
      data: { notes: JSON.stringify(filtered) },
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
