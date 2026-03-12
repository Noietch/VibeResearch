/**
 * Test environment setup
 * Ensures all tests use isolated storage directories
 */

import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// Test storage directory (isolated from production)
export const TEST_STORAGE_DIR = path.join(repoRoot, 'tests', 'tmp', 'storage');
export const TEST_DB_PATH = path.join(repoRoot, 'tests', 'tmp', 'integration.sqlite');

/**
 * Initialize test environment variables
 * Must be called BEFORE any imports that use storage-path.ts
 */
export function initTestEnv(): void {
  // Override storage directory for all tests
  process.env.RESEARCH_CLAW_STORAGE_DIR = TEST_STORAGE_DIR;
  process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
  process.env.NODE_ENV = 'test';
}

/**
 * Check if we're in test environment
 */
export function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}
