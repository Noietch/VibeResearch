import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  ClientSideConnection,
  ndJsonStream,
  type SessionNotification,
  type SessionUpdate,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';
import path from 'node:path';
import type { SshConnectConfig } from '@shared';
import { SshConnectionService, type SshSpawnHandle } from '../services/ssh-connection.service';
import {
  getEnhancedEnv,
  resolveCommandPath,
  resolveNpxPath,
  resolveWindowsShellPath,
} from '../utils/shell-env';
import { getCliProxyEnv } from '../utils/proxy-env';

/**
 * Map from backend name to the _meta key used for session resume in newSession().
 * Backends that resume via CLI args (gemini, opencode) are NOT listed here —
 * their resume args are injected at spawn time instead.
 */
const RESUME_META_KEY: Record<string, string> = {
  'claude-code': 'claudeCode',
  codex: 'codex',
  goose: 'goose',
  qwen: 'qwen',
  openclaw: 'openclaw',
};

export function shouldUseWindowsShellSpawn(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32') return false;

  const extension = path.extname(command).toLowerCase();
  return extension === '' || extension === '.cmd' || extension === '.bat';
}

function formatSpawnTarget(command: string, args: string[], shell: boolean | string): string {
  const rendered = [command, ...args].join(' ').trim();
  if (!shell) return rendered;
  if (typeof shell === 'string') {
    return `${shell} /c ${rendered}`.trim();
  }
  return rendered;
}

function toSpawnError(
  error: unknown,
  command: string,
  args: string[],
  shell: boolean | string,
): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `Failed to start ACP agent (${formatSpawnTarget(command, args, shell)}): ${message}`,
  );
}

/**
 * ACP client connection that spawns an agent process and communicates
 * via the @agentclientprotocol/sdk ClientSideConnection over stdio.
 *
 * Supported backends:
 *   - claude-agent-acp  (node dist/index.js)
 *   - codex             (npx @zed-industries/codex-acp)
 *   - gemini            (gemini --experimental-acp)
 *   - qwen              (qwen --acp)
 *   - goose             (goose acp)
 *   - any custom ACP-compatible agent
 *
 * Events emitted:
 *   'session:update'    (sessionId: string, update: SessionNotification)
 *   'session:finished'  (sessionId: string)
 *   'session:permission' (requestId: symbol, sessionId: string, request: RequestPermissionRequest, resolve: (r: RequestPermissionResponse) => void)
 *   'stderr'            (text: string)
 *   'exit'              (code: number | null, signal: string | null)
 */
export class AcpConnection extends EventEmitter {
  private child: ChildProcess | null = null;
  private conn: ClientSideConnection | null = null;
  private sshHandle: SshSpawnHandle | null = null;
  private sshConfig: SshConnectConfig | null = null;

  async spawn(
    cliPath: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>,
    resumeArgs?: string[],
  ): Promise<void> {
    const cliProxyEnv = getCliProxyEnv();

    // Use enhanced environment that includes shell PATH (for npx, node, etc.)
    // This is critical when Electron is launched from Finder/launchd instead of terminal
    const cleanEnv: Record<string, string | undefined> = {
      ...getEnhancedEnv(),
      ...cliProxyEnv,
      ...env,
      NODE_OPTIONS: undefined,
      NODE_INSPECT: undefined,
      ELECTRON_RUN_AS_NODE: undefined,
      // Prevent "cannot be launched inside another Claude Code session" error
      CLAUDECODE: undefined,
      CLAUDE_CODE_ENTRYPOINT: undefined,
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: undefined,
    };

    // cliPath may be:
    //   - a plain path:   "/usr/local/bin/gemini"
    //   - embedded args:  "node /path/to/claude-agent-acp/dist/index.js"
    //   - npx package:    "npx @zed-industries/codex-acp@0.18.0"
    const parts = cliPath.trim().split(/\s+/);
    const rawCmd = parts[0];
    let finalArgs = [...parts.slice(1), ...args, ...(resumeArgs ?? [])];

    if (rawCmd === 'npx' && finalArgs.length > 0 && !finalArgs.includes('--yes')) {
      finalArgs = ['--yes', '--prefer-offline', ...finalArgs];
    }

    // Resolve the command to its full path using enhanced environment.
    // For npx, use the dedicated resolver that finds it via the active node binary.
    // This is critical for Electron apps launched from Finder/launchd where
    // PATH may not include common locations like /opt/homebrew/bin.
    const resolvedCmd =
      rawCmd === 'npx' ? resolveNpxPath(cleanEnv) : resolveCommandPath(rawCmd, cleanEnv);
    console.log(`[AcpConnection] Spawning: ${rawCmd} -> ${resolvedCmd}`);
    const useShell = shouldUseWindowsShellSpawn(resolvedCmd);
    const windowsShell =
      useShell && process.platform === 'win32'
        ? (resolveWindowsShellPath(cleanEnv) ?? 'cmd.exe')
        : null;
    if (windowsShell) {
      cleanEnv.ComSpec ??= windowsShell;
      cleanEnv.COMSPEC ??= windowsShell;
    }
    const shell = useShell ? true : false;
    const shellDisplay = useShell ? (windowsShell ?? 'cmd.exe') : false;

    const spawnTarget = formatSpawnTarget(resolvedCmd, finalArgs, shellDisplay);
    let child: ChildProcess;

    try {
      child = spawn(resolvedCmd, finalArgs, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: cleanEnv as NodeJS.ProcessEnv,
        shell,
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      throw toSpawnError(error, resolvedCmd, finalArgs, shellDisplay);
    }

    this.child = child;

    let startupFinished = false;
    const startupFailure = new Promise<never>((_, reject) => {
      const rejectStartup = (error: Error) => {
        if (startupFinished) return;
        startupFinished = true;
        reject(error);
      };

      child.once('error', (error) => {
        rejectStartup(toSpawnError(error, resolvedCmd, finalArgs, shellDisplay));
      });

      child.once('exit', (code, signal) => {
        rejectStartup(
          new Error(
            `ACP agent exited before startup (${spawnTarget}): code=${code ?? 'null'} signal=${signal ?? 'null'}`,
          ),
        );
      });
    });

    child.on('error', (error) => {
      this.emit('stderr', toSpawnError(error, resolvedCmd, finalArgs, shellDisplay).message);
    });
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) this.emit('stderr', text);
    });
    child.on('exit', (code, signal) => {
      this.emit('exit', code, signal);
    });

    // Convert Node.js streams → Web Streams for the SDK
    try {
      const spawnReady = new Promise<void>((resolve) => {
        child.once('spawn', () => {
          resolve();
        });
      });

      await Promise.race([spawnReady, startupFailure]);

      if (!child.stdout || !child.stdin || !child.stderr) {
        startupFinished = true;
        throw new Error(`ACP agent did not expose stdio streams (${spawnTarget})`);
      }

      const readable = nodeReadableToWeb(child.stdout);
      const writable = nodeWritableToWeb(child.stdin);
      const stream = ndJsonStream(writable, readable);

      // Build the ClientSideConnection with our Client handler
      this.conn = new ClientSideConnection((_agent) => {
        return {
          // Agent → Client: real-time session updates (notifications)
          sessionUpdate: async (params: SessionNotification) => {
            this.emit('session:update', params.sessionId, params.update);
          },

          // Agent → Client: permission requests
          requestPermission: (
            params: RequestPermissionRequest,
          ): Promise<RequestPermissionResponse> => {
            return new Promise((resolve) => {
              const requestId = Symbol('permission');
              const sessionId =
                (params as RequestPermissionRequest & { sessionId?: string }).sessionId ?? '';
              this.emit('session:permission', requestId, sessionId, params, resolve);
            });
          },

          // Agent → Client: file system access
          readTextFile: async ({ path: filePath }) => {
            const fs = await import('node:fs/promises');
            const content = await fs.readFile(filePath, 'utf-8');
            return { content };
          },

          writeTextFile: async ({ path: filePath, content }) => {
            const fs = await import('node:fs/promises');
            await fs.writeFile(filePath, content, 'utf-8');
            return {};
          },
        };
      }, stream);

      // Initialize the ACP connection
      await Promise.race([
        this.conn.initialize({
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
          },
        }),
        startupFailure,
      ]);

      startupFinished = true;
    } catch (error) {
      this.conn = null;
      if (this.child === child) {
        this.child = null;
      }
      if (!child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore cleanup errors for failed startups.
        }
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Spawn an agent process on a remote server via SSH.
   * Uses the same ACP protocol over SSH channel.
   */
  async spawnRemote(
    sshConfig: SshConnectConfig,
    cliPath: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>,
    resumeArgs?: string[],
  ): Promise<void> {
    this.sshConfig = sshConfig;

    // Build the remote command
    // cliPath may contain spaces (e.g., "node /path/to/script.js")
    // We need to properly escape it for the remote shell
    const allArgs = [...args, ...(resumeArgs ?? [])];
    const fullCommand = `${cliPath} ${allArgs.join(' ')}`;

    // Spawn via SSH
    this.sshHandle = await SshConnectionService.spawnRemoteProcess(
      sshConfig,
      fullCommand,
      cwd,
      env,
    );

    // Handle stderr from SSH channel
    this.sshHandle.channel.stderr.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) this.emit('stderr', text);
    });

    // Handle channel close as exit
    this.sshHandle.channel.on('close', () => {
      this.emit('exit', null, null);
    });

    // Convert SSH channel (which is a duplex stream) to Web Streams
    // SSH channel implements both readable and writable
    const readable = sshChannelToReadableWeb(this.sshHandle.channel);
    const writable = sshChannelToWritableWeb(this.sshHandle.channel);
    const stream = ndJsonStream(writable, readable);

    // Build the ClientSideConnection with SSH-aware file handlers
    this.conn = new ClientSideConnection((_agent) => {
      return {
        sessionUpdate: async (params: SessionNotification) => {
          this.emit('session:update', params.sessionId, params.update);
        },

        requestPermission: (
          params: RequestPermissionRequest,
        ): Promise<RequestPermissionResponse> => {
          return new Promise((resolve) => {
            const requestId = Symbol('permission');
            const sessionId =
              (params as RequestPermissionRequest & { sessionId?: string }).sessionId ?? '';
            this.emit('session:permission', requestId, sessionId, params, resolve);
          });
        },

        // Remote file operations via SFTP when using SSH
        readTextFile: async ({ path: filePath }) => {
          if (this.sshConfig) {
            const content = await SshConnectionService.readRemoteFile(this.sshConfig, filePath);
            return { content };
          }
          const fs = await import('node:fs/promises');
          const content = await fs.readFile(filePath, 'utf-8');
          return { content };
        },

        writeTextFile: async ({ path: filePath, content }) => {
          if (this.sshConfig) {
            await SshConnectionService.writeRemoteFile(this.sshConfig, filePath, content);
            return {};
          }
          const fs = await import('node:fs/promises');
          await fs.writeFile(filePath, content, 'utf-8');
          return {};
        },
      };
    }, stream);

    // Initialize the ACP connection
    await this.conn.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
    });
  }

  async createSession(cwd: string, resumeSessionId?: string, backend?: string): Promise<string> {
    if (!this.conn) throw new Error('Not connected');

    const params: Parameters<ClientSideConnection['newSession']>[0] = {
      cwd,
      mcpServers: [],
    };

    if (resumeSessionId) {
      // Each backend uses a different _meta key for resume.
      // CLI-args-based backends (gemini, opencode) handle resume at spawn time,
      // so they don't need _meta here — but we still set it as a no-op fallback.
      const metaKey = RESUME_META_KEY[backend ?? ''];
      if (metaKey) {
        (params as Record<string, unknown>)._meta = {
          [metaKey]: { options: { resume: resumeSessionId } },
        };
      }
    }

    const result = await this.conn.newSession(params);
    return result.sessionId;
  }

  async setSessionMode(sessionId: string, modeId: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    await this.conn.setSessionMode({ sessionId, modeId });
  }

  async sendPrompt(sessionId: string, prompt: string): Promise<void> {
    console.log(
      '[AcpConnection] sendPrompt sessionId=',
      sessionId,
      'prompt length=',
      prompt.length,
    );
    if (!this.conn) throw new Error('Not connected');
    console.log('[AcpConnection] calling conn.prompt...');
    await this.conn.prompt({
      sessionId,
      prompt: [{ type: 'text', text: prompt }],
    });
    console.log('[AcpConnection] conn.prompt returned, emitting session:finished');
    this.emit('session:finished', sessionId);
  }

  /**
   * Respond to a permission request.
   * @param resolve  The resolve function captured in the 'session:permission' event.
   * @param optionId The selected option ID.
   */
  respondToPermission(resolve: (r: RequestPermissionResponse) => void, optionId: string): void {
    resolve({ outcome: { outcome: 'selected', optionId } });
  }

  kill(): void {
    // Kill local process if running
    if (this.child && !this.child.killed) {
      if (this.child.pid && process.platform !== 'win32') {
        try {
          process.kill(-this.child.pid, 'SIGTERM');
        } catch {
          this.child.kill('SIGTERM');
        }
      } else {
        this.child.kill('SIGTERM');
      }
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }, 3000);
    }

    // Kill SSH connection if active
    if (this.sshHandle) {
      this.sshHandle.kill();
      this.sshHandle = null;
    }
  }
}

// ── Stream conversion helpers ────────────────────────────────────────────────

function nodeReadableToWeb(nodeReadable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeReadable.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeReadable.on('end', () => {
        controller.close();
      });
      nodeReadable.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeReadable.destroy();
    },
  });
}

function nodeWritableToWeb(nodeWritable: Writable): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise((resolve, reject) => {
        nodeWritable.write(chunk, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        nodeWritable.end(resolve);
      });
    },
    abort(reason) {
      nodeWritable.destroy(reason instanceof Error ? reason : new Error(String(reason)));
    },
  });
}

// ── SSH Channel stream conversion helpers ─────────────────────────────────────

import type { ClientChannel } from 'ssh2';

function sshChannelToReadableWeb(channel: ClientChannel): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      channel.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      channel.on('end', () => {
        controller.close();
      });
      channel.on('error', (err: Error) => {
        controller.error(err);
      });
    },
    cancel() {
      channel.destroy();
    },
  });
}

function sshChannelToWritableWeb(channel: ClientChannel): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise((resolve, reject) => {
        const canContinue = channel.write(chunk);
        if (canContinue) {
          resolve();
        } else {
          // Wait for drain event if buffer is full
          channel.once('drain', resolve);
        }
      });
    },
    close() {
      return new Promise((resolve) => {
        channel.end(resolve);
      });
    },
    abort() {
      channel.destroy();
    },
  });
}
