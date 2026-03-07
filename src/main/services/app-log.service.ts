import fs from 'fs';
import path from 'path';
import { ensureStorageDir, getStorageDir } from '../store/storage-path';

function getLogsDir(): string {
  return path.join(getStorageDir(), 'logs');
}

export function getLogFilePath(name = 'app.log'): string {
  return path.join(getLogsDir(), name);
}

export function appendLog(scope: string, message: string, data?: unknown, file = 'app.log'): void {
  try {
    ensureStorageDir();
    fs.mkdirSync(getLogsDir(), { recursive: true });
    const payload = {
      ts: new Date().toISOString(),
      scope,
      message,
      ...(data === undefined ? {} : { data }),
    };
    fs.appendFileSync(getLogFilePath(file), `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (err) {
    console.error('[logging] Failed to write log:', err);
  }
}

export function writeDebugFile(name: string, content: string): string {
  ensureStorageDir();
  fs.mkdirSync(getLogsDir(), { recursive: true });
  const filePath = getLogFilePath(name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function makeTimestampedLogName(prefix: string, suffix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${suffix}`;
}
