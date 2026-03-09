import { getPrismaClient } from '../client';

// ── Input types ────────────────────────────────────────────────────────────────

export interface CreateTaskResultInput {
  todoId: string;
  runId?: string;
  projectId: string;
  relativePath: string;
  fileName: string;
  fileType: string;
  mimeType?: string;
  sizeBytes?: number;
  title?: string;
  description?: string;
  tags?: string[];
  generatedBy?: string;
}

export interface TaskResultQuery {
  todoId?: string;
  projectId?: string;
  runId?: string;
  fileType?: string;
}

// ── Repository ─────────────────────────────────────────────────────────────────

export class TaskResultRepository {
  private prisma = getPrismaClient();

  async create(data: CreateTaskResultInput) {
    return this.prisma.taskResult.create({
      data: {
        todoId: data.todoId,
        runId: data.runId,
        projectId: data.projectId,
        relativePath: data.relativePath,
        fileName: data.fileName,
        fileType: data.fileType,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        title: data.title,
        description: data.description,
        tagsJson: JSON.stringify(data.tags ?? []),
        generatedBy: data.generatedBy ?? 'agent',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.taskResult.findUnique({
      where: { id },
      include: { todo: true, project: true },
    });
  }

  async findMany(query: TaskResultQuery) {
    return this.prisma.taskResult.findMany({
      where: {
        ...(query.todoId ? { todoId: query.todoId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.fileType ? { fileType: query.fileType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { todo: { select: { id: true, title: true } } },
    });
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      tags: string[];
      fileType: string;
    }>,
  ) {
    return this.prisma.taskResult.update({
      where: { id },
      data: {
        ...data,
        ...(data.tags ? { tagsJson: JSON.stringify(data.tags) } : {}),
      },
    });
  }

  async delete(id: string) {
    return this.prisma.taskResult.delete({ where: { id } });
  }

  async deleteByTodoId(todoId: string) {
    return this.prisma.taskResult.deleteMany({ where: { todoId } });
  }

  async deleteByProjectId(projectId: string) {
    return this.prisma.taskResult.deleteMany({ where: { projectId } });
  }

  async count(query: TaskResultQuery) {
    return this.prisma.taskResult.count({
      where: {
        ...(query.todoId ? { todoId: query.todoId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.fileType ? { fileType: query.fileType } : {}),
      },
    });
  }
}
