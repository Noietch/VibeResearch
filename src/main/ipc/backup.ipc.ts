import { ipcMain, dialog, BrowserWindow } from 'electron';
import { type IpcResult, ok, err } from '@shared';
import { createBackup, restoreBackup, getBackupInfo } from '../services/backup.service';

export function setupBackupIpc() {
  ipcMain.handle('backup:create', async (): Promise<IpcResult<unknown>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog(win!, {
        title: 'Save Backup',
        defaultPath: `researchclaw-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });

      if (result.canceled || !result.filePath) {
        return ok(null);
      }

      const backup = await createBackup(result.filePath);
      return ok(backup);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[backup:create] Error:', msg);
      return err(msg);
    }
  });

  ipcMain.handle('backup:restore', async (): Promise<IpcResult<unknown>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win!, {
        title: 'Restore from Backup',
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return ok(null);
      }

      const zipPath = result.filePaths[0];

      // Validate backup before restoring
      const info = getBackupInfo(zipPath);
      if (!info) {
        return err('Invalid backup file: no manifest found');
      }

      const restored = await restoreBackup(zipPath);
      return ok(restored);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[backup:restore] Error:', msg);
      return err(msg);
    }
  });

  ipcMain.handle('backup:getInfo', async (_, zipPath: string): Promise<IpcResult<unknown>> => {
    try {
      const info = getBackupInfo(zipPath);
      return ok(info);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[backup:getInfo] Error:', msg);
      return err(msg);
    }
  });
}
