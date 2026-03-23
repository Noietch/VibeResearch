import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'not-available'; info: UpdateInfo }
  | { state: 'downloading'; progress: ProgressInfo }
  | { state: 'downloaded'; info: UpdateInfo }
  | { state: 'error'; message: string };

let currentStatus: UpdateStatus = { state: 'idle' };

function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

export function initAutoUpdater() {
  // Don't auto-download — let the user decide
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    currentStatus = { state: 'checking' };
    broadcast('updater:status', currentStatus);
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    currentStatus = { state: 'available', info };
    broadcast('updater:status', currentStatus);
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    currentStatus = { state: 'not-available', info };
    broadcast('updater:status', currentStatus);
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    currentStatus = { state: 'downloading', progress };
    broadcast('updater:status', currentStatus);
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    currentStatus = { state: 'downloaded', info };
    broadcast('updater:status', currentStatus);
  });

  autoUpdater.on('error', (err: Error) => {
    currentStatus = { state: 'error', message: err.message };
    broadcast('updater:status', currentStatus);
  });

  // Check for updates on startup (after a short delay to let the app settle)
  setTimeout(() => {
    checkForUpdates().catch((err) => {
      console.error('[auto-updater] Startup check failed:', err);
    });
  }, 5000);
}

export async function checkForUpdates() {
  return autoUpdater.checkForUpdates();
}

export async function downloadUpdate() {
  return autoUpdater.downloadUpdate();
}

export function quitAndInstall() {
  autoUpdater.quitAndInstall();
}
