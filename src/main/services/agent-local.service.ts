import { execSync, spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { appendLog, getLogFilePath } from './app-log.service';
import {
  AGENT_SERVICE_HOST,
  AGENT_SERVICE_PORT,
  AGENT_SERVICE_VERSION,
  type AgentRunRequest,
  type AgentTestRequest,
  type AgentTestResponse,
} from './agent-local-server';
import type { CliUsageSummary } from './cli-runner.service';

let sidecarProcess: ChildProcess | null = null;

function resetSidecarProcess() {
  sidecarProcess = null;
}

function getAugmentedPath(): string {
  const base = process.env.PATH ?? '';
  const extras = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    path.join(os.homedir(), '.local/bin'),
    path.join(os.homedir(), '.npm-global/bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
  ];
  const parts = new Set([...base.split(':'), ...extras].filter(Boolean));
  return Array.from(parts).join(':');
}

function resolveSidecarNodeBinary(): string {
  const explicitCandidates = [process.env.VIBE_AGENT_NODE, process.env.NODE].filter(
    (value): value is string => !!value?.trim(),
  );

  for (const candidate of explicitCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const resolved = execSync('command -v node', {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: getAugmentedPath(),
      },
      shell: process.env.SHELL || '/bin/zsh',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (resolved) {
      return resolved;
    }
  } catch {
    // Fall back to PATH lookup below.
  }

  return 'node';
}

export function getAgentServiceBaseUrl() {
  return `http://${AGENT_SERVICE_HOST}:${AGENT_SERVICE_PORT}`;
}

async function ensureHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${getAgentServiceBaseUrl()}/health`);
    if (!response.ok) return false;
    const payload = (await response.json()) as { version?: string };
    return payload.version === AGENT_SERVICE_VERSION;
  } catch {
    return false;
  }
}

async function waitForHealthy(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ensureHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Agent local service did not become healthy in time.');
}

export async function startAgentLocalService(): Promise<void> {
  if (await ensureHealthy()) {
    appendLog('agent-service', 'startup:reuse', { baseUrl: getAgentServiceBaseUrl() }, 'agent.log');
    return;
  }

  if (sidecarProcess && !sidecarProcess.killed) {
    await waitForHealthy();
    return;
  }

  const entryPath = path.join(__dirname, 'agent-local.js');
  const nodeBinary = resolveSidecarNodeBinary();
  const stdoutLog = getLogFilePath('agent-local-sidecar.stdout.log');
  const stderrLog = getLogFilePath('agent-local-sidecar.stderr.log');

  sidecarProcess = spawn(nodeBinary, [entryPath], {
    env: {
      ...process.env,
      PATH: getAugmentedPath(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  sidecarProcess.stdout?.on('data', (chunk) => {
    fs.appendFileSync(stdoutLog, chunk);
  });
  sidecarProcess.stderr?.on('data', (chunk) => {
    fs.appendFileSync(stderrLog, chunk);
  });
  sidecarProcess.once('error', (error) => {
    appendLog(
      'agent-service',
      'sidecar:error',
      {
        error: error.message,
        entryPath,
        nodeBinary,
        stdoutLog,
        stderrLog,
      },
      'agent.log',
    );
  });
  sidecarProcess.once('exit', (code, signal) => {
    appendLog(
      'agent-service',
      'sidecar:exit',
      { code, signal, pid: sidecarProcess?.pid, nodeBinary, stdoutLog, stderrLog },
      'agent.log',
    );
    resetSidecarProcess();
  });

  appendLog(
    'agent-service',
    'startup:spawn',
    {
      entryPath,
      nodeBinary,
      electronExecPath: process.execPath,
      pid: sidecarProcess.pid,
      stdoutLog,
      stderrLog,
    },
    'agent.log',
  );
  await waitForHealthy();
}

export function stopAgentLocalService(): void {
  if (!sidecarProcess || sidecarProcess.killed) return;
  sidecarProcess.kill('SIGTERM');
  appendLog('agent-service', 'shutdown', { pid: sidecarProcess.pid }, 'agent.log');
  sidecarProcess = null;
}

async function fetchJsonWithRestart<T>(pathName: string, init?: RequestInit): Promise<T> {
  const tryFetch = async () => {
    const response = await fetch(`${getAgentServiceBaseUrl()}${pathName}`, init);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Agent service HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  };

  try {
    return await tryFetch();
  } catch (error) {
    appendLog(
      'agent-service',
      'client:fetchFailed',
      { pathName, error: error instanceof Error ? error.message : String(error) },
      'agent.log',
    );
    resetSidecarProcess();
    await startAgentLocalService();
    return tryFetch();
  }
}

export async function callAgentServiceTest(input: AgentTestRequest): Promise<AgentTestResponse> {
  return fetchJsonWithRestart<AgentTestResponse>('/v1/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function callAgentServiceRun(
  input: AgentRunRequest,
): Promise<{ sessionId: string; started: boolean }> {
  return fetchJsonWithRestart<{ sessionId: string; started: boolean }>('/v1/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function callAgentServiceKill(sessionId: string): Promise<{ killed: boolean }> {
  return fetchJsonWithRestart<{ killed: boolean }>(`/v1/kill/${sessionId}`, {
    method: 'POST',
  });
}

export async function attachAgentServiceStream(
  sessionId: string,
  handlers: {
    onOutput: (data: string) => void;
    onError: (data: string) => void;
    onUsage: (usage: CliUsageSummary) => void;
    onDone: (code: number | null) => void;
  },
): Promise<{ close: () => void }> {
  let response: Response;
  try {
    response = await fetch(`${getAgentServiceBaseUrl()}/v1/stream/${sessionId}`, {
      headers: { accept: 'text/event-stream' },
    });
  } catch (error) {
    appendLog(
      'agent-service',
      'client:streamFetchFailed',
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      'agent.log',
    );
    resetSidecarProcess();
    await startAgentLocalService();
    response = await fetch(`${getAgentServiceBaseUrl()}/v1/stream/${sessionId}`, {
      headers: { accept: 'text/event-stream' },
    });
  }
  if (!response.ok || !response.body) {
    throw new Error(`Failed to attach stream for session ${sessionId}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let closed = false;

  const parseChunk = (chunk: string) => {
    buffer += chunk;
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const lines = frame.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice(7);
      const data = JSON.parse(dataLine.slice(6));
      if (event === 'output') handlers.onOutput(String((data as { data?: string }).data ?? ''));
      if (event === 'error') handlers.onError(String((data as { data?: string }).data ?? ''));
      if (event === 'usage') handlers.onUsage((data as { usage: CliUsageSummary }).usage);
      if (event === 'done') handlers.onDone((data as { code?: number | null }).code ?? null);
    }
  };

  void (async () => {
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      parseChunk(decoder.decode(value, { stream: true }));
    }
  })();

  return {
    close: () => {
      closed = true;
      reader.cancel().catch(() => undefined);
    },
  };
}
