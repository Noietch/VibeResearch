import { ipcMain, dialog } from 'electron';
import { TaskResultsService } from '../services/task-results.service';
import { type IpcResult, ok, err } from '@shared';

let svc: TaskResultsService | null = null;

function getTaskResultsService() {
  if (!svc) svc = new TaskResultsService();
  return svc;
}

export function setupTaskResultsIpc() {
  // Scan and register results for a task
  ipcMain.handle(
    'task-results:scan',
    async (_, todoId: string, runId?: string): Promise<IpcResult<unknown>> => {
      try {
        const results = await getTaskResultsService().scanAndRegisterResults(todoId, runId);
        return ok(results);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[task-results:scan] Error:', msg);
        return err(msg);
      }
    },
  );

  // Manually add a result file
  ipcMain.handle('task-results:add', async (_, input): Promise<IpcResult<unknown>> => {
    try {
      // If no filePath provided, show file picker
      if (!input.filePath) {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'All Files', extensions: ['*'] },
            { name: 'Data', extensions: ['csv', 'json', 'xlsx', 'tsv'] },
            { name: 'Figures', extensions: ['png', 'jpg', 'svg', 'pdf'] },
            { name: 'Documents', extensions: ['md', 'txt', 'tex'] },
          ],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return err('No file selected');
        }
        input.filePath = result.filePaths[0];
      }

      const result = await getTaskResultsService().addResultFile(input);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[task-results:add] Error:', msg);
      return err(msg);
    }
  });

  // List results
  ipcMain.handle('task-results:list', async (_, query): Promise<IpcResult<unknown>> => {
    try {
      const results = await getTaskResultsService().listResults(query);
      return ok(results);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[task-results:list] Error:', msg);
      return err(msg);
    }
  });

  // Get result content
  ipcMain.handle(
    'task-results:get-content',
    async (_, resultId: string): Promise<IpcResult<unknown>> => {
      try {
        const content = await getTaskResultsService().getResultContent(resultId);
        return ok(content);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[task-results:get-content] Error:', msg);
        return err(msg);
      }
    },
  );

  // Get result file path
  ipcMain.handle(
    'task-results:get-path',
    async (_, resultId: string): Promise<IpcResult<unknown>> => {
      try {
        const filePath = await getTaskResultsService().getResultFilePath(resultId);
        return ok(filePath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[task-results:get-path] Error:', msg);
        return err(msg);
      }
    },
  );

  // Update result metadata
  ipcMain.handle('task-results:update', async (_, resultId, data): Promise<IpcResult<unknown>> => {
    try {
      const result = await getTaskResultsService().updateResult(resultId, data);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[task-results:update] Error:', msg);
      return err(msg);
    }
  });

  // Delete result
  ipcMain.handle(
    'task-results:delete',
    async (_, resultId: string): Promise<IpcResult<unknown>> => {
      try {
        await getTaskResultsService().deleteResult(resultId);
        return ok({ deleted: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[task-results:delete] Error:', msg);
        return err(msg);
      }
    },
  );
}
