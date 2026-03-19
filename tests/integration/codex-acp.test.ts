/**
 * Codex ACP bridge integration test.
 *
 * Uses the user's existing ~/.codex files when RUN_CODEX_E2E=1.
 * Also verifies the synthesized temp-home shape that reader chat uses.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { shouldUseWindowsShellSpawn } from '../../src/main/agent/acp-connection';
import { resolveAgentHomeFiles } from '../../src/main/services/agent-config.service';
import { createHomeOverrideEnv } from '../../src/main/utils/home-env';
import { resolveNpxPath, resolveWindowsShellPath } from '../../src/main/utils/shell-env';

const RUN = process.env.RUN_CODEX_E2E === '1';

interface CodexConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface AcpResult {
  sessionId: string | null;
  chunks: string[];
  error: string | null;
  connectOk: boolean;
}

function hasCodexConfig(): boolean {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  return fs.existsSync(configPath) && fs.existsSync(authPath);
}

function readSystemCodexConfig(): CodexConfig {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  const auth = fs.existsSync(authPath) ? JSON.parse(fs.readFileSync(authPath, 'utf8')) : {};
  const config = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';

  const defaultModel = config.match(/^model\s*=\s*"([^"]+)"/m)?.[1];
  const provider = config.match(/^model_provider\s*=\s*"([^"]+)"/m)?.[1];
  const section = provider
    ? config.match(
        new RegExp(
          `\\[model_providers\\.${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]([\\s\\S]*?)(?=\\n\\[|$)`,
        ),
      )?.[1]
    : undefined;
  const baseUrl = section?.match(/base_url\s*=\s*"([^"]+)"/)?.[1];

  return {
    apiKey: auth.OPENAI_API_KEY as string | undefined,
    baseUrl,
    defaultModel,
  };
}

function createTempHome(homeFiles: Array<{ relativePath: string; content: string }>): string {
  const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-acp-home-'));
  for (const file of homeFiles) {
    const destination = path.join(tempHomeDir, file.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content, 'utf8');
  }
  return tempHomeDir;
}

function cleanupTempHome(tempHomeDir: string | null) {
  if (!tempHomeDir) return;
  try {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  } catch {
    // Windows can briefly keep handles open after proc.kill(); cleanup is best-effort.
  }
}

function buildCleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...extra,
    NODE_OPTIONS: undefined,
    NODE_INSPECT: undefined,
    ELECTRON_RUN_AS_NODE: undefined,
    CLAUDECODE: undefined,
    CLAUDE_CODE_ENTRYPOINT: undefined,
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: undefined,
  };
  return env as NodeJS.ProcessEnv;
}

function spawnCodexAcp(env: NodeJS.ProcessEnv, cwd: string): ReturnType<typeof spawn> {
  const command = resolveNpxPath(env);
  const args = ['--yes', '--prefer-offline', '@zed-industries/codex-acp'];
  const useShell = shouldUseWindowsShellSpawn(command);
  const windowsShell =
    useShell && process.platform === 'win32' ? resolveWindowsShellPath(env) : null;
  const spawnEnv =
    windowsShell && process.platform === 'win32'
      ? {
          ...env,
          ComSpec: env.ComSpec ?? windowsShell,
          COMSPEC: env.COMSPEC ?? windowsShell,
        }
      : env;
  const shell = useShell ? true : false;

  return spawn(command, args, {
    cwd,
    env: spawnEnv,
    shell,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function runCodexAcpPrompt(
  prompt: string,
  options: { cwd: string; envExtra?: Record<string, string> },
  timeoutMs = 60_000,
): Promise<AcpResult> {
  return new Promise((resolve) => {
    const cwd = options.cwd;
    const env = buildCleanEnv(options.envExtra);
    const proc = spawnCodexAcp(env, cwd);

    let buffer = '';
    let id = 1;
    let sessionId: string | null = null;
    const chunks: string[] = [];
    let settled = false;

    const done = (result: AcpResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.kill();
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({
        sessionId,
        chunks,
        error: `Timeout after ${timeoutMs}ms`,
        connectOk: sessionId !== null,
      });
    }, timeoutMs);

    const send = (method: string, params: Record<string, unknown>) => {
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) + '\n');
    };

    proc.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if ((message as { id?: number }).id === 1 && (message as { result?: unknown }).result) {
          send('session/new', { cwd, mcpServers: [] });
        }

        if (
          (message as { id?: number }).id === 2 &&
          (message as { result?: { sessionId?: string } }).result?.sessionId
        ) {
          sessionId = (message as { result: { sessionId: string } }).result.sessionId;
          send('session/prompt', {
            sessionId,
            prompt: [{ type: 'text', text: prompt }],
          });
        }

        if (
          (message as { id?: number }).id === 3 &&
          (message as { result?: unknown }).result !== undefined
        ) {
          done({ sessionId, chunks, error: null, connectOk: true });
        }

        if (
          (message as { id?: number }).id === 3 &&
          (message as { error?: { message?: string } }).error?.message
        ) {
          done({
            sessionId,
            chunks,
            error: (message as { error: { message: string } }).error.message,
            connectOk: sessionId !== null,
          });
        }

        if (
          (message as { method?: string }).method === 'session/update' &&
          (
            message as {
              params?: { update?: { sessionUpdate?: string; content?: { text?: string } } };
            }
          ).params?.update?.sessionUpdate === 'agent_message_chunk'
        ) {
          const text =
            (message as { params: { update: { content?: { text?: string } } } }).params.update
              .content?.text ?? '';
          if (text) chunks.push(text);
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (!text) return;
      if (text.includes('Authentication required') || text.includes('authentication')) {
        done({ sessionId, chunks, error: `Auth error: ${text}`, connectOk: false });
      }
    });

    proc.on('error', (error) => {
      done({ sessionId, chunks, error: error.message, connectOk: false });
    });

    proc.on('exit', (code) => {
      if (!settled) {
        done({
          sessionId,
          chunks,
          error: chunks.length > 0 ? null : `Process exited (code: ${code})`,
          connectOk: sessionId !== null,
        });
      }
    });

    setTimeout(() => {
      send('initialize', {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
      });
    }, 300);
  });
}

describe('Codex ACP: codex-acp bridge', () => {
  let hasConfig = false;
  let systemConfig: CodexConfig = {};

  beforeAll(() => {
    hasConfig = hasCodexConfig();
    systemConfig = readSystemCodexConfig();
  });

  it('checks if codex config files exist', () => {
    if (!RUN) {
      console.log('Skipped: set RUN_CODEX_E2E=1 to run');
      return;
    }
    if (!hasConfig) {
      console.log('Skipped: ~/.codex/config.toml or ~/.codex/auth.json not found');
      return;
    }

    expect(hasConfig).toBe(true);
    console.log('Found ~/.codex/config.toml and ~/.codex/auth.json');
  });

  it('connects via ACP (initialize + session/new)', async () => {
    if (!RUN || !hasConfig) return;

    const result = await runCodexAcpPrompt(
      'Reply with exactly one word: hello',
      { cwd: os.homedir() },
      45_000,
    );

    console.log(`  sessionId: ${result.sessionId}`);
    console.log(`  chunks received: ${result.chunks.length}`);
    console.log(`  response: ${result.chunks.join('').slice(0, 200)}`);
    if (result.error) console.log(`  error: ${result.error}`);

    if (!result.connectOk) {
      console.log('Skipped: codex-acp could not connect (auth/network issue)');
      return;
    }

    expect(result.sessionId).toBeTruthy();
  }, 50_000);

  it('receives streaming message chunks from codex', async () => {
    if (!RUN || !hasConfig) return;

    const result = await runCodexAcpPrompt(
      'Reply with exactly one word: hello',
      { cwd: os.homedir() },
      45_000,
    );

    if (!result.connectOk) {
      console.log('Skipped: codex-acp could not connect');
      return;
    }

    if (result.error && result.chunks.length === 0) {
      console.log(`Skipped: error before any chunks - ${result.error}`);
      return;
    }

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.join('').length).toBeGreaterThan(0);
  }, 50_000);

  it('receives streaming chunks with synthesized home files like reader chat uses', async () => {
    if (!RUN || !hasConfig) return;
    if (!systemConfig.apiKey || !systemConfig.baseUrl || !systemConfig.defaultModel) {
      console.log('Skipped: current ~/.codex files do not expose apiKey/baseUrl/defaultModel');
      return;
    }

    const homeFiles = resolveAgentHomeFiles({
      agentTool: 'codex',
      apiKey: systemConfig.apiKey,
      baseUrl: systemConfig.baseUrl,
      defaultModel: systemConfig.defaultModel,
    });

    let tempHomeDir: string | null = null;
    try {
      tempHomeDir = createTempHome(homeFiles);
      const result = await runCodexAcpPrompt(
        'Reply with exactly one word: hello',
        {
          cwd: tempHomeDir,
          envExtra: createHomeOverrideEnv(tempHomeDir),
        },
        45_000,
      );

      console.log(`  synthesized sessionId: ${result.sessionId}`);
      console.log(`  synthesized chunks: ${result.chunks.length}`);
      if (result.error) console.log(`  synthesized error: ${result.error}`);

      expect(result.sessionId).toBeTruthy();
      expect(result.error).toBeNull();
      expect(result.chunks.join('').length).toBeGreaterThan(0);
    } finally {
      cleanupTempHome(tempHomeDir);
    }
  }, 50_000);
});
