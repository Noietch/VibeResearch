import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { getStorageDir, getPapersBaseDir, getDbPath } from '../store/storage-path';

export interface BackupManifest {
  version: 1;
  createdAt: string;
  paperCount: number;
  dbSizeBytes: number;
}

export interface BackupResult {
  path: string;
  sizeBytes: number;
  paperCount: number;
}

const CONFIG_FILES = [
  'app-settings.json',
  'provider-config.json',
  'cli-tools.json',
  'model-configs.json',
  'model-config.json',
  'token-usage.json',
  'ssh-servers.json',
  'discovery-cache.json',
];

/**
 * Create a backup zip containing the database, papers, and config files.
 */
export async function createBackup(outputPath: string): Promise<BackupResult> {
  const storageDir = getStorageDir();
  const dbPath = getDbPath();
  const papersDir = getPapersBaseDir();

  // Count papers
  let paperCount = 0;
  if (fs.existsSync(papersDir)) {
    const entries = await fsp.readdir(papersDir);
    paperCount = entries.length;
  }

  // Get DB size
  let dbSizeBytes = 0;
  if (fs.existsSync(dbPath)) {
    const stat = await fsp.stat(dbPath);
    dbSizeBytes = stat.size;
  }

  // Create manifest
  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    paperCount,
    dbSizeBytes,
  };

  return new Promise<BackupResult>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    output.on('close', () => {
      resolve({
        path: outputPath,
        sizeBytes: archive.pointer(),
        paperCount,
      });
    });

    archive.on('error', reject);
    archive.pipe(output);

    // Add manifest
    archive.append(JSON.stringify(manifest, null, 2), { name: 'backup-manifest.json' });

    // Add database
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: 'researchclaw.db' });
    }

    // Add config files
    for (const file of CONFIG_FILES) {
      const filePath = path.join(storageDir, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
      }
    }

    // Add papers directory
    if (fs.existsSync(papersDir)) {
      archive.directory(papersDir, 'papers');
    }

    archive.finalize();
  });
}

/**
 * Read the backup manifest from a zip file without fully extracting it.
 */
export function getBackupInfo(zipPath: string): BackupManifest | null {
  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry('backup-manifest.json');
    if (!entry) return null;
    const data = zip.readAsText(entry);
    return JSON.parse(data) as BackupManifest;
  } catch {
    return null;
  }
}

/**
 * Restore from a backup zip file.
 * Overwrites current data — the caller should confirm with the user first.
 */
export async function restoreBackup(zipPath: string): Promise<{ paperCount: number }> {
  // Validate first
  const manifest = getBackupInfo(zipPath);
  if (!manifest || manifest.version !== 1) {
    throw new Error('Invalid or unsupported backup file');
  }

  const storageDir = getStorageDir();

  // Extract the zip to the storage directory
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(storageDir, true); // overwrite = true

  return { paperCount: manifest.paperCount };
}
