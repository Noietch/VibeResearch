import { ipcMain, dialog } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  listSshServers,
  getSshServer,
  saveSshServer,
  removeSshServer,
  getDecryptedSshPassword,
  getDecryptedSshPassphrase,
  updateDefaultCwd,
} from '../store/ssh-server-store';
import { SshConnectionService } from '../services/ssh-connection.service';
import {
  type IpcResult,
  ok,
  err,
  type SshServerConfig,
  type SshConnectConfig,
  type SshConfigEntry,
} from '@shared';

function parseSshConfig(content: string): SshConfigEntry[] {
  const entries: SshConfigEntry[] = [];
  let current: SshConfigEntry | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const key = line.slice(0, spaceIdx).toLowerCase();
    const value = line.slice(spaceIdx + 1).trim();

    if (key === 'host') {
      if (current) entries.push(current);
      // Skip wildcard patterns
      if (value === '*' || value.includes('*') || value.includes('?')) {
        current = null;
      } else {
        current = { host: value };
      }
    } else if (current) {
      if (key === 'hostname') {
        current.hostname = value;
      } else if (key === 'port') {
        const p = parseInt(value, 10);
        if (!isNaN(p)) current.port = p;
      } else if (key === 'user') {
        current.user = value;
      } else if (key === 'identityfile') {
        current.identityFile = value.replace(/^~/, os.homedir());
      }
    }
  }
  if (current) entries.push(current);
  return entries;
}

export function setupSshIpc() {
  // List all SSH servers
  ipcMain.handle('ssh:list-servers', async (): Promise<IpcResult<SshServerConfig[]>> => {
    try {
      const servers = listSshServers();
      return ok(servers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:list-servers] Error:', msg);
      return err(msg);
    }
  });

  // Get a single SSH server
  ipcMain.handle(
    'ssh:get-server',
    async (_, id: string): Promise<IpcResult<SshServerConfig | null>> => {
      try {
        const server = getSshServer(id);
        return ok(server ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[ssh:get-server] Error:', msg);
        return err(msg);
      }
    },
  );

  // Add a new SSH server
  ipcMain.handle('ssh:add-server', async (_, input): Promise<IpcResult<SshServerConfig>> => {
    try {
      const server = saveSshServer(input);
      return ok(server);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:add-server] Error:', msg);
      return err(msg);
    }
  });

  // Update an existing SSH server
  ipcMain.handle('ssh:update-server', async (_, input): Promise<IpcResult<SshServerConfig>> => {
    try {
      const server = saveSshServer(input);
      return ok(server);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:update-server] Error:', msg);
      return err(msg);
    }
  });

  // Remove an SSH server
  ipcMain.handle('ssh:remove-server', async (_, id: string): Promise<IpcResult<void>> => {
    try {
      removeSshServer(id);
      return ok(undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:remove-server] Error:', msg);
      return err(msg);
    }
  });

  // Test SSH connection
  ipcMain.handle('ssh:test-connection', async (_, config: SshConnectConfig) => {
    try {
      const result = await SshConnectionService.testConnection(config);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:test-connection] Error:', msg);
      return { success: false, error: msg };
    }
  });

  // List remote directory via SFTP
  ipcMain.handle('ssh:list-directory', async (_, config: SshConnectConfig, path: string) => {
    try {
      const entries = await SshConnectionService.listDirectory(config, path);
      return { success: true, entries };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:list-directory] Error:', msg);
      return { success: false, error: msg };
    }
  });

  // Detect remote agents
  ipcMain.handle('ssh:detect-remote-agents', async (_, config: SshConnectConfig) => {
    try {
      const agents = await SshConnectionService.detectRemoteAgents(config);
      return { success: true, agents };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:detect-remote-agents] Error:', msg);
      return { success: false, error: msg };
    }
  });

  // Select private key file via dialog
  ipcMain.handle('ssh:select-key-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select SSH Private Key',
        properties: ['openFile'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'PEM Key', extensions: ['pem', 'key'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: null };
      }
      return { canceled: false, path: result.filePaths[0] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:select-key-file] Error:', msg);
      return { canceled: true, error: msg };
    }
  });

  // Update default CWD for a server
  ipcMain.handle(
    'ssh:update-default-cwd',
    async (_, id: string, cwd: string): Promise<IpcResult<void>> => {
      try {
        updateDefaultCwd(id, cwd);
        return ok(undefined);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[ssh:update-default-cwd] Error:', msg);
        return err(msg);
      }
    },
  );

  // Get decrypted password (for internal use only)
  ipcMain.handle(
    'ssh:get-password',
    async (_, id: string): Promise<IpcResult<string | undefined>> => {
      try {
        const password = getDecryptedSshPassword(id);
        return ok(password);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[ssh:get-password] Error:', msg);
        return err(msg);
      }
    },
  );

  // Scan default SSH config locations (cross-platform) and return parsed entries
  ipcMain.handle('ssh:scan-config', async (): Promise<IpcResult<SshConfigEntry[]>> => {
    try {
      const candidates: string[] = [];
      const home = os.homedir();
      const platform = process.platform;

      if (platform === 'win32') {
        // Windows: %USERPROFILE%\.ssh\config, %PROGRAMDATA%\ssh\config
        candidates.push(path.join(home, '.ssh', 'config'));
        const programData = process.env.PROGRAMDATA;
        if (programData) candidates.push(path.join(programData, 'ssh', 'config'));
      } else {
        // macOS / Linux: ~/.ssh/config (standard location)
        candidates.push(path.join(home, '.ssh', 'config'));
      }

      for (const configPath of candidates) {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf-8');
          const entries = parseSshConfig(content);
          if (entries.length > 0) return ok(entries);
        }
      }
      return ok([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:scan-config] Error:', msg);
      return err(msg);
    }
  });

  // Parse a user-selected SSH config file
  ipcMain.handle('ssh:parse-config-file', async (): Promise<IpcResult<SshConfigEntry[]>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select SSH Config File',
        properties: ['openFile'],
        filters: [
          { name: 'SSH Config', extensions: ['*'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        defaultPath: path.join(os.homedir(), '.ssh'),
      });
      if (result.canceled || result.filePaths.length === 0) {
        return ok([]);
      }
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const entries = parseSshConfig(content);
      return ok(entries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ssh:parse-config-file] Error:', msg);
      return err(msg);
    }
  });
}
