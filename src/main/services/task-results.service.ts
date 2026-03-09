import fs from 'fs';
import path from 'path';
import { TaskResultRepository, ProjectsRepository, AgentTodoRepository } from '@db';

export type TaskResultFileType = 'data' | 'figure' | 'log' | 'document' | 'other';

export interface CreateTaskResultInput {
  todoId: string;
  runId?: string;
  projectId: string;
  relativePath: string;
  fileName: string;
  fileType: TaskResultFileType;
  mimeType?: string;
  sizeBytes?: number;
  title?: string;
  description?: string;
  tags?: string[];
  generatedBy?: 'agent' | 'user';
}

export interface TaskResultItem {
  id: string;
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
  tags: string[];
  generatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  todo?: { id: string; title: string };
}

const FILE_TYPE_EXTENSIONS: Record<TaskResultFileType, string[]> = {
  data: ['.csv', '.json', '.xlsx', '.xls', '.tsv', '.parquet', '.h5', '.hdf5', '.pkl', '.pickle'],
  figure: ['.png', '.jpg', '.jpeg', '.svg', '.pdf', '.gif', '.webp', '.eps'],
  log: ['.log', '.txt', '.out', '.err'],
  document: ['.md', '.markdown', '.doc', '.docx', '.tex', '.rst'],
  other: [],
};

const MIME_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.tsv': 'text/tab-separated-values',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.tex': 'application/x-tex',
};

function detectFileType(fileName: string): TaskResultFileType {
  const ext = path.extname(fileName).toLowerCase();
  for (const [type, extensions] of Object.entries(FILE_TYPE_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return type as TaskResultFileType;
    }
  }
  return 'other';
}

function getMimeType(fileName: string): string | undefined {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_TYPES[ext];
}

export class TaskResultsService {
  private repo = new TaskResultRepository();
  private projectsRepo = new ProjectsRepository();
  private todosRepo = new AgentTodoRepository();

  /**
   * Scan a task's output directory and register result files
   */
  async scanAndRegisterResults(todoId: string, runId?: string): Promise<TaskResultItem[]> {
    const todo = await this.todosRepo.findTodoById(todoId);
    if (!todo) {
      throw new Error(`Task not found: ${todoId}`);
    }

    const projectId = todo.projectId;
    if (!projectId) {
      // No project associated, nothing to scan
      return [];
    }

    const project = await this.projectsRepo.getProject(projectId);
    if (!project?.workdir) {
      return [];
    }

    // Build output directory path
    const outputDir = todo.outputDir
      ? path.resolve(project.workdir, todo.outputDir)
      : path.join(project.workdir, 'results', todoId);

    if (!fs.existsSync(outputDir)) {
      return [];
    }

    const results: TaskResultItem[] = [];
    const files = this.listFilesRecursive(outputDir);

    for (const filePath of files) {
      const relativePath = path.relative(outputDir, filePath);
      const fileName = path.basename(filePath);
      const stat = fs.statSync(filePath);

      // Skip directories and hidden files
      if (stat.isDirectory() || fileName.startsWith('.')) {
        continue;
      }

      // Check if already registered
      const existing = await this.repo.findMany({
        todoId,
        projectId,
      });
      const alreadyRegistered = existing.some((r) => r.relativePath === relativePath);
      if (alreadyRegistered) {
        continue;
      }

      const fileType = detectFileType(fileName);
      const mimeType = getMimeType(fileName);

      const created = await this.repo.create({
        todoId,
        runId,
        projectId,
        relativePath,
        fileName,
        fileType,
        mimeType,
        sizeBytes: stat.size,
        generatedBy: 'agent',
      });

      results.push(this.toItem(created));
    }

    return results;
  }

  /**
   * Manually add a result file
   */
  async addResultFile(input: {
    todoId: string;
    runId?: string;
    filePath: string;
    title?: string;
    description?: string;
    tags?: string[];
  }): Promise<TaskResultItem> {
    const todo = await this.todosRepo.findTodoById(input.todoId);
    if (!todo) {
      throw new Error(`Task not found: ${input.todoId}`);
    }

    const projectId = todo.projectId;
    if (!projectId) {
      throw new Error('Task has no associated project');
    }

    const project = await this.projectsRepo.getProject(projectId);
    if (!project?.workdir) {
      throw new Error('Project has no working directory');
    }

    // Copy file to results directory
    const resultsDir = path.join(project.workdir, 'results', input.todoId);
    fs.mkdirSync(resultsDir, { recursive: true });

    const fileName = path.basename(input.filePath);
    const destPath = path.join(resultsDir, fileName);

    // Handle duplicate filenames
    let finalDestPath = destPath;
    let counter = 1;
    while (fs.existsSync(finalDestPath)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      finalDestPath = path.join(resultsDir, `${base}-${counter}${ext}`);
      counter++;
    }

    fs.copyFileSync(input.filePath, finalDestPath);

    const relativePath = path.relative(resultsDir, finalDestPath);
    const stat = fs.statSync(finalDestPath);
    const fileType = detectFileType(fileName);
    const mimeType = getMimeType(fileName);

    const created = await this.repo.create({
      todoId: input.todoId,
      runId: input.runId,
      projectId,
      relativePath,
      fileName: path.basename(finalDestPath),
      fileType,
      mimeType,
      sizeBytes: stat.size,
      title: input.title,
      description: input.description,
      tags: input.tags,
      generatedBy: 'user',
    });

    return this.toItem(created);
  }

  /**
   * List results for a project or task
   */
  async listResults(query: {
    projectId?: string;
    todoId?: string;
    runId?: string;
    fileType?: string;
  }): Promise<TaskResultItem[]> {
    const results = await this.repo.findMany(query);
    return results.map((r) => this.toItem(r));
  }

  /**
   * Get result content (for AI to read)
   */
  async getResultContent(resultId: string): Promise<{
    content: string;
    mimeType?: string;
    fileName: string;
  }> {
    const result = await this.repo.findById(resultId);
    if (!result) {
      throw new Error(`Result not found: ${resultId}`);
    }

    const project = await this.projectsRepo.getProject(result.projectId);
    if (!project?.workdir) {
      throw new Error('Project has no working directory');
    }

    // Build full file path
    const todo = await this.todosRepo.findTodoById(result.todoId);
    const outputDir = todo?.outputDir
      ? path.resolve(project.workdir, todo.outputDir)
      : path.join(project.workdir, 'results', result.todoId);
    const filePath = path.join(outputDir, result.relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      content,
      mimeType: result.mimeType ?? undefined,
      fileName: result.fileName,
    };
  }

  /**
   * Get the full file path for a result
   */
  async getResultFilePath(resultId: string): Promise<string> {
    const result = await this.repo.findById(resultId);
    if (!result) {
      throw new Error(`Result not found: ${resultId}`);
    }

    const project = await this.projectsRepo.getProject(result.projectId);
    if (!project?.workdir) {
      throw new Error('Project has no working directory');
    }

    const todo = await this.todosRepo.findTodoById(result.todoId);
    const outputDir = todo?.outputDir
      ? path.resolve(project.workdir, todo.outputDir)
      : path.join(project.workdir, 'results', result.todoId);

    return path.join(outputDir, result.relativePath);
  }

  /**
   * Update result metadata
   */
  async updateResult(
    resultId: string,
    data: {
      title?: string;
      description?: string;
      tags?: string[];
      fileType?: TaskResultFileType;
    },
  ): Promise<TaskResultItem> {
    const updated = await this.repo.update(resultId, data);
    return this.toItem(updated);
  }

  /**
   * Delete a result
   */
  async deleteResult(resultId: string): Promise<void> {
    const result = await this.repo.findById(resultId);
    if (!result) {
      return;
    }

    // Optionally delete the file
    try {
      const filePath = await this.getResultFilePath(resultId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore file deletion errors
    }

    await this.repo.delete(resultId);
  }

  private listFilesRecursive(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(...this.listFilesRecursive(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private toItem(r: {
    id: string;
    todoId: string;
    runId: string | null;
    projectId: string;
    relativePath: string;
    fileName: string;
    fileType: string;
    mimeType: string | null;
    sizeBytes: number | null;
    title: string | null;
    description: string | null;
    tagsJson: string;
    generatedBy: string;
    createdAt: Date;
    updatedAt: Date;
    todo?: { id: string; title: string };
  }): TaskResultItem {
    return {
      id: r.id,
      todoId: r.todoId,
      runId: r.runId ?? undefined,
      projectId: r.projectId,
      relativePath: r.relativePath,
      fileName: r.fileName,
      fileType: r.fileType,
      mimeType: r.mimeType ?? undefined,
      sizeBytes: r.sizeBytes ?? undefined,
      title: r.title ?? undefined,
      description: r.description ?? undefined,
      tags: JSON.parse(r.tagsJson) as string[],
      generatedBy: r.generatedBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      todo: r.todo,
    };
  }
}
