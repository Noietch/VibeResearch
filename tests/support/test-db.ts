import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPrismaClient } from '@db';
import { TEST_DB_PATH, TEST_STORAGE_DIR } from './test-env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const prismaBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);
const testDbPath = TEST_DB_PATH;

let initialized = false;

const ensureDatabaseUrl = () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;
  // Ensure test storage directory exists
  mkdirSync(TEST_STORAGE_DIR, { recursive: true });
};

export const ensureTestDatabaseSchema = () => {
  if (initialized) {
    return;
  }

  ensureDatabaseUrl();

  // Clean up test database files
  rmSync(testDbPath, { force: true });
  rmSync(`${testDbPath}-wal`, { force: true });
  rmSync(`${testDbPath}-journal`, { force: true });

  // Clean up test storage directory (vec-store, settings, etc.)
  rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  mkdirSync(TEST_STORAGE_DIR, { recursive: true });

  const env = {
    ...process.env,
    DATABASE_URL: `file:${testDbPath}`,
  };
  // Prisma 6.4.1 schema engine crashes on db push when RUST_LOG=warn is inherited.
  delete env.RUST_LOG;
  const prismaArgs = ['db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate'];
  execFileSync(prismaBin, prismaArgs, {
    cwd: repoRoot,
    stdio: 'pipe',
    env,
    shell: process.platform === 'win32',
  });

  initialized = true;
};

export const resetTestDatabase = async () => {
  ensureTestDatabaseSchema();
  ensureDatabaseUrl();
  const prisma = getPrismaClient();

  // Delete in correct order (children before parents)
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.taskResult.deleteMany();
  await prisma.experimentReport.deleteMany();
  await prisma.agentTodoMessage.deleteMany();
  await prisma.agentTodoRun.deleteMany();
  await prisma.agentTodo.deleteMany();
  await prisma.agentConfig.deleteMany();
  await prisma.paperCitation.deleteMany();
  await prisma.projectPaper.deleteMany();
  await prisma.projectIdea.deleteMany();
  await prisma.projectRepo.deleteMany();
  await prisma.project.deleteMany();
  await prisma.paperCodeLink.deleteMany();
  await prisma.readingNote.deleteMany();
  await prisma.paperTag.deleteMany();
  await prisma.sourceEvent.deleteMany();
  await prisma.paper.deleteMany();
  await prisma.tag.deleteMany();
};

export const closeTestDatabase = async () => {
  const prisma = getPrismaClient();
  await prisma.$disconnect();
};
