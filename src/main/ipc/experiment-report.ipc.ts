import { ipcMain, BrowserWindow } from 'electron';
import { ExperimentReportService } from '../services/experiment-report.service';
import { type IpcResult, ok, err } from '@shared';

let svc: ExperimentReportService | null = null;

function getExperimentReportService() {
  if (!svc) svc = new ExperimentReportService();
  return svc;
}

const activeGenerations = new Map<string, AbortController>();

export function setupExperimentReportIpc() {
  // Generate report (streaming)
  ipcMain.handle(
    'report:generate',
    async (
      event,
      input: {
        projectId: string;
        title: string;
        todoIds: string[];
        resultIds?: string[];
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { error: 'No window found' };

      const generationId = `gen-${Date.now()}`;
      const controller = new AbortController();
      activeGenerations.set(generationId, controller);

      try {
        const report = await getExperimentReportService().generateReport(
          input,
          (chunk) => {
            win.webContents.send('report:generate:chunk', chunk);
          },
          controller.signal,
        );
        win.webContents.send('report:generate:done', report);
        return { generationId, started: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[report:generate] Error:', msg);
        win.webContents.send('report:generate:error', msg);
        return { error: msg };
      } finally {
        activeGenerations.delete(generationId);
      }
    },
  );

  // Kill active generation
  ipcMain.handle('report:generate:kill', async (_, generationId: string) => {
    const controller = activeGenerations.get(generationId);
    if (controller) {
      controller.abort();
      activeGenerations.delete(generationId);
      return { killed: true };
    }
    return { killed: false };
  });

  // List reports
  ipcMain.handle('report:list', async (_, projectId: string): Promise<IpcResult<unknown>> => {
    try {
      const reports = await getExperimentReportService().listReports(projectId);
      return ok(reports);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[report:list] Error:', msg);
      return err(msg);
    }
  });

  // Get report
  ipcMain.handle('report:get', async (_, reportId: string): Promise<IpcResult<unknown>> => {
    try {
      const report = await getExperimentReportService().getReport(reportId);
      return ok(report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[report:get] Error:', msg);
      return err(msg);
    }
  });

  // Update report
  ipcMain.handle(
    'report:update',
    async (_, reportId: string, data): Promise<IpcResult<unknown>> => {
      try {
        const report = await getExperimentReportService().updateReport(reportId, data);
        return ok(report);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[report:update] Error:', msg);
        return err(msg);
      }
    },
  );

  // Delete report
  ipcMain.handle('report:delete', async (_, reportId: string): Promise<IpcResult<unknown>> => {
    try {
      await getExperimentReportService().deleteReport(reportId);
      return ok({ deleted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[report:delete] Error:', msg);
      return err(msg);
    }
  });
}
