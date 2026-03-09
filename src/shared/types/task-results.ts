// Task Result types

export type TaskResultFileType = 'data' | 'figure' | 'log' | 'document' | 'other';

export interface TaskResultItem {
  id: string;
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
  tags: string[];
  generatedBy: 'agent' | 'user';
  createdAt: Date;
  updatedAt: Date;
  todo?: { id: string; title: string };
}

export interface TaskResultContent {
  content: string;
  mimeType?: string;
  fileName: string;
}

// Experiment Report types

export interface ExperimentReportItem {
  id: string;
  projectId: string;
  title: string;
  content: string;
  summary?: string;
  todoIds: string[];
  resultIds: string[];
  generatedAt: Date;
  modelUsed?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerateReportInput {
  projectId: string;
  title: string;
  todoIds: string[];
  resultIds?: string[];
}
