import { ipcMain } from 'electron';
import {
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getUpdateStatus,
} from '../services/auto-updater.service';

export function setupUpdaterIpc() {
  ipcMain.handle('updater:getStatus', () => {
    return getUpdateStatus();
  });

  ipcMain.handle('updater:checkForUpdates', async () => {
    await checkForUpdates();
    return getUpdateStatus();
  });

  ipcMain.handle('updater:downloadUpdate', async () => {
    await downloadUpdate();
    return { success: true };
  });

  ipcMain.handle('updater:quitAndInstall', () => {
    quitAndInstall();
  });
}
