import { describe, it, expect, beforeEach } from 'vitest';
import { VecStore, resetVecStore } from '../../src/db/vec-store';

describe('VecStore', () => {
  let store: VecStore;

  beforeEach(() => {
    resetVecStore();
    store = new VecStore();
    store.initialize(3, 'test-model');
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
    const newStore = new VecStore();
    // Not initialized
    expect(newStore.isInitialized()).toBe(false);
    expect(newStore.searchKNN(new Float32Array([1, 0, 0]), 5)).toEqual([]);
  });
});
