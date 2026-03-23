/**
 * Verification test to ensure test/production isolation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getStorageDir, getDbPath } from '../../src/main/store/storage-path';
import { TEST_STORAGE_DIR, TEST_DB_PATH } from './test-env';
import path from 'path';

function normalizePath(value: string | undefined): string {
  return (value ?? '').replaceAll('\\', '/');
}

describe('Test Environment Isolation', () => {
  beforeAll(() => {
    // Verify NODE_ENV is set to test
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should use test storage directory', () => {
    const storageDir = getStorageDir();
    expect(storageDir).toBe(TEST_STORAGE_DIR);
    expect(normalizePath(storageDir)).toContain('tests/tmp/storage');
    expect(storageDir).not.toContain('.researchclaw');
  });

  it('should use test database path', () => {
    const dbPath = getDbPath();
    expect(normalizePath(dbPath)).toContain('tests/tmp');
    expect(dbPath).not.toContain('.researchclaw');

    // Verify it uses the test storage directory
    expect(dbPath).toBe(path.join(TEST_STORAGE_DIR, 'researchclaw.db'));
  });

  it('should have DATABASE_URL pointing to test database', () => {
    expect(process.env.DATABASE_URL).toBe(`file:${TEST_DB_PATH}`);
    expect(normalizePath(process.env.DATABASE_URL)).toContain('tests/tmp');
    expect(process.env.DATABASE_URL).not.toContain('.researchclaw');
  });

  it('should have RESEARCH_CLAW_STORAGE_DIR set to test directory', () => {
    expect(process.env.RESEARCH_CLAW_STORAGE_DIR).toBe(TEST_STORAGE_DIR);
    expect(normalizePath(process.env.RESEARCH_CLAW_STORAGE_DIR)).toContain('tests/tmp/storage');
  });
});
