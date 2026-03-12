import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { VecStore, resetVecStore } from '../../src/db/vec-store';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('VecStore', () => {
  let store: VecStore;
  let tempDir: string;

  beforeAll(() => {
    // Ensure we're in test mode
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    resetVecStore();
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'vec-store-test-'));
    store = new VecStore(tempDir);
    store.initialize(3, 'test-model');
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should initialize with dimension and model', () => {
    expect(store.isInitialized()).toBe(true);
    expect(store.getDimension()).toBe(3);
    expect(store.getModel()).toBe('test-model');
  });

  it('should upsert and retrieve vectors', () => {
    const embedding = new Float32Array([1, 0, 0]);
    store.upsert('chunk1', embedding);
    expect(store.getCount()).toBe(1);
  });

  it('should search for K nearest neighbors', () => {
    // Insert some vectors
    store.upsert('chunk1', new Float32Array([1, 0, 0]));
    store.upsert('chunk2', new Float32Array([0, 1, 0]));
    store.upsert('chunk3', new Float32Array([0, 0, 1]));

    // Search for vector close to [1, 0, 0]
    const results = store.searchKNN(new Float32Array([0.9, 0.1, 0]), 2);

    expect(results.length).toBe(2);
    expect(results[0].chunkId).toBe('chunk1'); // Should be closest
    expect(results[0].distance).toBeLessThan(results[1].distance);
  });

  it('should delete by paper ID', () => {
    store.upsert('paper1_001', new Float32Array([1, 0, 0]));
    store.upsert('paper1_002', new Float32Array([0, 1, 0]));
    store.upsert('paper2_001', new Float32Array([0, 0, 1]));

    store.deleteByPaperId('paper1');

    expect(store.getCount()).toBe(1);
    expect(store.searchKNN(new Float32Array([0, 0, 1]), 1)[0].chunkId).toBe('paper2_001');
  });

  it('should delete by chunk IDs', () => {
    store.upsert('chunk1', new Float32Array([1, 0, 0]));
    store.upsert('chunk2', new Float32Array([0, 1, 0]));
    store.upsert('chunk3', new Float32Array([0, 0, 1]));

    store.deleteMany(['chunk1', 'chunk2']);

    expect(store.getCount()).toBe(1);
  });

  it('should handle dimension mismatch', () => {
    store.upsert('chunk1', new Float32Array([1, 0, 0]));

    // Try to insert wrong dimension
    expect(() => {
      store.upsert('chunk2', new Float32Array([1, 0]));
    }).toThrow('Dimension mismatch');
  });

  it('should return empty results when not initialized', () => {
    const newTempDir = mkdtempSync(join(tmpdir(), 'vec-store-test-'));
    const newStore = new VecStore(newTempDir);
    // Not initialized
    expect(newStore.isInitialized()).toBe(false);
    expect(newStore.searchKNN(new Float32Array([1, 0, 0]), 5)).toEqual([]);
    // Clean up
    rmSync(newTempDir, { recursive: true, force: true });
  });
});
