import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ipc, type ProjectItem } from '../../hooks/use-ipc';
import type { TaskResultItem } from '@shared';
import {
  FileText,
  Image,
  FileCode,
  File,
  Trash2,
  Upload,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

const FILE_TYPE_ICONS: Record<string, React.ElementType> = {
  data: FileCode,
  figure: Image,
  log: FileText,
  document: FileText,
  other: File,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  data: 'text-blue-600 bg-blue-50',
  figure: 'text-green-600 bg-green-50',
  log: 'text-gray-600 bg-gray-50',
  document: 'text-purple-600 bg-purple-50',
  other: 'text-gray-600 bg-gray-50',
};

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResultsTab({ project }: { project: ProjectItem }) {
  const [results, setResults] = useState<TaskResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    try {
      const data = await ipc.listTaskResults({ projectId: project.id });
      setResults(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const handleScanAll = async () => {
    // Get all tasks for this project
    const tasks = await ipc.listAgentTodos({ projectId: project.id });
    for (const task of tasks) {
      setScanning(task.id);
      try {
        await ipc.scanTaskResults(task.id);
      } catch {
        // silent
      }
    }
    setScanning(null);
    await loadResults();
  };

  const handleAddFile = async () => {
    // Show a task picker first
    const tasks = await ipc.listAgentTodos({ projectId: project.id });
    if (tasks.length === 0) {
      alert('No tasks available. Please create a task first.');
      return;
    }
    // For now, use the first task (in real app, show a picker)
    const taskId = tasks[0].id;
    try {
      await ipc.addTaskResult({ todoId: taskId });
      await loadResults();
    } catch (e) {
      console.error('[addTaskResult] failed:', e);
    }
  };

  const handleDelete = async (resultId: string) => {
    if (!confirm('Delete this result file?')) return;
    try {
      await ipc.deleteTaskResult(resultId);
      await loadResults();
    } catch (e) {
      console.error('[deleteTaskResult] failed:', e);
    }
  };

  const handleOpenFile = async (resultId: string) => {
    try {
      const path = await ipc.getTaskResultPath(resultId);
      // Open in external editor
      const { shell } = window.require ? window.require('electron') : { shell: null };
      if (shell) {
        shell.openPath(path);
      }
    } catch (e) {
      console.error('[openFile] failed:', e);
    }
  };

  // Group results by task
  const groupedResults = results.reduce(
    (acc, result) => {
      const key = result.todo?.title ?? result.todoId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(result);
      return acc;
    },
    {} as Record<string, TaskResultItem[]>,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-notion-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2">
        <motion.button
          onClick={handleScanAll}
          disabled={!!scanning}
          className="inline-flex items-center gap-1.5 rounded-lg bg-notion-sidebar-hover px-3 py-1.5 text-sm font-medium text-notion-text hover:bg-notion-accent-light disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Scan All
        </motion.button>
        <motion.button
          onClick={handleAddFile}
          className="inline-flex items-center gap-1.5 rounded-lg bg-notion-text px-3 py-1.5 text-sm font-medium text-white hover:opacity-80"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Upload size={14} />
          Add File
        </motion.button>
      </div>

      {/* Results list */}
      {results.length === 0 ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-8 text-center text-sm text-notion-text-tertiary"
        >
          No results yet. Run tasks to generate output files, or manually add files.
        </motion.p>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedResults).map(([taskTitle, taskResults]) => (
            <motion.div
              key={taskTitle}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <h3 className="text-sm font-medium text-notion-text-secondary">{taskTitle}</h3>
              <div className="space-y-1">
                {taskResults.map((result) => {
                  const Icon = FILE_TYPE_ICONS[result.fileType] ?? File;
                  const colorClass = FILE_TYPE_COLORS[result.fileType] ?? FILE_TYPE_COLORS.other;
                  return (
                    <motion.div
                      key={result.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group flex items-center gap-3 rounded-lg border border-notion-border bg-white p-3 hover:border-notion-accent/30 hover:bg-notion-accent-light"
                    >
                      <div className={clsx('rounded-lg p-2', colorClass)}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-notion-text">
                          {result.fileName}
                        </p>
                        <p className="truncate text-xs text-notion-text-tertiary">
                          {result.title ?? result.relativePath}
                          {result.sizeBytes && ` • ${formatBytes(result.sizeBytes)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleOpenFile(result.id)}
                          className="rounded p-1.5 text-notion-text-tertiary hover:bg-notion-sidebar-hover hover:text-notion-text"
                          title="Open file"
                        >
                          <ExternalLink size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(result.id)}
                          className="rounded p-1.5 text-notion-text-tertiary hover:bg-red-50 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
