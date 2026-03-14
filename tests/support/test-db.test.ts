import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();

vi.mock('node:child_process', () => ({
  execFileSync,
}));

vi.mock('@db', () => ({
  getPrismaClient: vi.fn(() => ({
    chatMessage: { deleteMany: vi.fn() },
    chatSession: { deleteMany: vi.fn() },
    taskResult: { deleteMany: vi.fn() },
    experimentReport: { deleteMany: vi.fn() },
    agentTodoMessage: { deleteMany: vi.fn() },
    agentTodoRun: { deleteMany: vi.fn() },
    agentTodo: { deleteMany: vi.fn() },
    agentConfig: { deleteMany: vi.fn() },
    paperCitation: { deleteMany: vi.fn() },
    projectPaper: { deleteMany: vi.fn() },
    projectIdea: { deleteMany: vi.fn() },
    projectRepo: { deleteMany: vi.fn() },
    project: { deleteMany: vi.fn() },
    paperCodeLink: { deleteMany: vi.fn() },
    readingNote: { deleteMany: vi.fn() },
    paperTag: { deleteMany: vi.fn() },
    sourceEvent: { deleteMany: vi.fn() },
    paper: { deleteMany: vi.fn() },
    tag: { deleteMany: vi.fn() },
    $disconnect: vi.fn(),
  })),
}));

describe('test-db helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    execFileSync.mockReset();
    process.env.RUST_LOG = 'warn';
  });

  it('removes RUST_LOG before invoking prisma db push', async () => {
    const { ensureTestDatabaseSchema } = await import('./test-db');

    ensureTestDatabaseSchema();

    expect(execFileSync).toHaveBeenCalledTimes(1);
    const options = execFileSync.mock.calls[0]?.[2];
    expect(options?.env?.DATABASE_URL).toContain('tests/tmp/integration.sqlite');
    expect(options?.env?.RUST_LOG).toBeUndefined();
  });
});
