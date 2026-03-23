import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { getEnhancedEnv, mergePaths, clearShellEnvCache } from '../../src/main/utils/shell-env';

const delimiter = path.delimiter;

describe('shell-env', () => {
  beforeEach(() => {
    clearShellEnvCache();
  });

  describe('mergePaths', () => {
    it('should merge two PATH strings and remove duplicates', () => {
      const path1 = ['/usr/local/bin', '/usr/bin'].join(delimiter);
      const path2 = ['/opt/homebrew/bin', '/usr/bin'].join(delimiter);
      const result = mergePaths(path1, path2);

      // Should have all unique paths
      expect(result).toContain('/usr/local/bin');
      expect(result).toContain('/usr/bin');
      expect(result).toContain('/opt/homebrew/bin');

      // /usr/bin should appear only once (from path1, since path1 comes first)
      const parts = result.split(delimiter);
      const usrBinCount = parts.filter((p) => p === '/usr/bin').length;
      expect(usrBinCount).toBe(1);
    });

    it('should handle empty paths gracefully', () => {
      expect(mergePaths('', '/usr/bin')).toBe('/usr/bin');
      expect(mergePaths('/usr/bin', '')).toBe('/usr/bin');
      expect(mergePaths('', '')).toBe('');
    });

    it('should handle undefined paths', () => {
      expect(mergePaths(undefined, '/usr/bin')).toBe('/usr/bin');
      expect(mergePaths('/usr/bin', undefined)).toBe('/usr/bin');
      expect(mergePaths(undefined, undefined)).toBe('');
    });

    it('should preserve order from first path then second', () => {
      const path1 = ['/first', '/second'].join(delimiter);
      const path2 = ['/third', '/fourth'].join(delimiter);
      const result = mergePaths(path1, path2);

      const parts = result.split(delimiter);
      expect(parts[0]).toBe('/first');
      expect(parts[1]).toBe('/second');
      expect(parts[2]).toBe('/third');
      expect(parts[3]).toBe('/fourth');
    });
  });

  describe('getEnhancedEnv', () => {
    it('should return environment with PATH', () => {
      const env = getEnhancedEnv();

      expect(env.PATH).toBeDefined();
      expect(env.PATH.length).toBeGreaterThan(0);
    });

    it('should merge custom environment variables', () => {
      const customEnv = { CUSTOM_VAR: 'custom_value' };
      const env = getEnhancedEnv(customEnv);

      expect(env.CUSTOM_VAR).toBe('custom_value');
    });

    it('should merge custom PATH with existing PATH', () => {
      const customPath = '/custom/path';
      const env = getEnhancedEnv({ PATH: customPath });

      // Should contain both the custom path and system paths
      expect(env.PATH).toContain('/custom/path');
    });

    it('should include standard environment variables', () => {
      const env = getEnhancedEnv();

      // These should be inherited from process.env
      expect(env.HOME).toBeDefined();
    });

    it('should be callable multiple times without error', () => {
      // First call
      const env1 = getEnhancedEnv();
      // Second call (uses cache)
      const env2 = getEnhancedEnv();

      expect(env1.PATH).toBe(env2.PATH);
    });
  });
});
