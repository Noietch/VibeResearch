import { getPrismaClient } from '../client';

// ── Input types ────────────────────────────────────────────────────────────────

export interface CreateExperimentReportInput {
  projectId: string;
  title: string;
  content: string;
  summary?: string;
  todoIds?: string[];
  resultIds?: string[];
  modelUsed?: string;
}

// ── Repository ─────────────────────────────────────────────────────────────────

export class ExperimentReportRepository {
  private prisma = getPrismaClient();

  async create(data: CreateExperimentReportInput) {
    return this.prisma.experimentReport.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        content: data.content,
        summary: data.summary,
        todoIdsJson: JSON.stringify(data.todoIds ?? []),
        resultIdsJson: JSON.stringify(data.resultIds ?? []),
        modelUsed: data.modelUsed,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.experimentReport.findUnique({
      where: { id },
      include: { project: true },
    });
  }

  async findByProjectId(projectId: string) {
    return this.prisma.experimentReport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      content: string;
      summary: string;
      todoIds: string[];
      resultIds: string[];
      version: number;
    }>,
  ) {
    const updateData: Record<string, unknown> = { ...data };
    if (data.todoIds) {
      updateData.todoIdsJson = JSON.stringify(data.todoIds);
      delete updateData.todoIds;
    }
    if (data.resultIds) {
      updateData.resultIdsJson = JSON.stringify(data.resultIds);
      delete updateData.resultIds;
    }
    return this.prisma.experimentReport.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string) {
    return this.prisma.experimentReport.delete({ where: { id } });
  }

  async deleteByProjectId(projectId: string) {
    return this.prisma.experimentReport.deleteMany({ where: { projectId } });
  }
}
