import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('AgentTaskRunner error handling', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unmock('../../src/main/agent/acp-connection');
    vi.restoreAllMocks();
  });

  it('rejects startup failures without turning them into EventEmitter unhandled errors', async () => {
    vi.resetModules();

    class MockAcpConnection extends EventEmitter {
      spawn = vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Failed to start ACP agent (cmd.exe /c npx.cmd --yes --prefer-offline @zed-industries/codex-acp): spawn cmd.exe ENOENT',
          ),
        );
      createSession = vi.fn();
      setSessionMode = vi.fn();
      sendPrompt = vi.fn();
      kill = vi.fn();
      respondToPermission = vi.fn();
    }

    vi.doMock('../../src/main/agent/acp-connection', () => ({
      AcpConnection: MockAcpConnection,
    }));

    const uncaughtException = vi.fn();
    process.once('uncaughtException', uncaughtException);

    try {
      const { AgentTaskRunner } = await import('../../src/main/services/agent-task-runner');
      const runner = new AgentTaskRunner({
        todoId: 'todo-1',
        runId: 'run-1',
        backend: 'codex',
        cliPath: 'npx @zed-industries/codex-acp',
        acpArgs: [],
        cwd: process.cwd(),
        yoloMode: false,
      });

      await expect(runner.start('Summarize this paper')).rejects.toThrow(
        /Failed to start ACP agent .*ENOENT/,
      );
      expect(runner.getStatus()).toBe('failed');

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(uncaughtException).not.toHaveBeenCalled();
    } finally {
      process.removeListener('uncaughtException', uncaughtException);
    }
  });
});
