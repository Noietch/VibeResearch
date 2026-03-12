// @prisma/client is a CommonJS module; use default import for ESM compatibility
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
type PrismaClientType = InstanceType<typeof PrismaClient>;

import { getDbPath } from '../main/store/storage-path';

let prisma: PrismaClientType | undefined;
let currentDatabaseUrl: string | undefined;

export const getPrismaClient = (): PrismaClientType => {
  // Set DATABASE_URL before PrismaClient initializes
  // Respect existing DATABASE_URL (e.g., set by tests)
  if (!process.env.DATABASE_URL) {
    const dbPath = getDbPath();
    process.env.DATABASE_URL = `file:${dbPath}`;
  }

  // Recreate client if DATABASE_URL changed (e.g., switching to test database)
  if (prisma && currentDatabaseUrl !== process.env.DATABASE_URL) {
    prisma.$disconnect();
    prisma = undefined;
  }

  if (!prisma) {
    currentDatabaseUrl = process.env.DATABASE_URL;
    prisma = new PrismaClient();
  }

  return prisma;
};
