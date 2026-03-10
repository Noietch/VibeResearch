import { describe, expect, it } from 'vitest';
import { getTagStyle } from '../../src/shared/utils/tag-style';

describe('getTagStyle', () => {
  describe('known categories', () => {
    it('returns blue style for domain category', () => {
      const style = getTagStyle('domain');
      expect(style.bg).toBe('bg-blue-50');
      expect(style.text).toBe('text-blue-700');
    });

    it('returns purple style for method category', () => {
      const style = getTagStyle('method');
      expect(style.bg).toBe('bg-purple-50');
      expect(style.text).toBe('text-purple-700');
    });

    it('returns green style for topic category', () => {
      const style = getTagStyle('topic');
      expect(style.bg).toBe('bg-green-50');
      expect(style.text).toBe('text-green-700');
    });
  });

  describe('unknown categories fallback to topic (green)', () => {
    it('returns green style for unknown string category', () => {
      const style = getTagStyle('unknown-category');
      expect(style.bg).toBe('bg-green-50');
      expect(style.text).toBe('text-green-700');
    });

    it('returns green style for empty string', () => {
      const style = getTagStyle('');
      expect(style.bg).toBe('bg-green-50');
      expect(style.text).toBe('text-green-700');
    });

    it('returns green style for random string', () => {
      const style = getTagStyle('foobar');
      expect(style.bg).toBe('bg-green-50');
      expect(style.text).toBe('text-green-700');
    });

    it('returns green style for uppercase category', () => {
      // Categories are case-sensitive; 'DOMAIN' != 'domain'
      const style = getTagStyle('DOMAIN');
      expect(style.bg).toBe('bg-green-50');
      expect(style.text).toBe('text-green-700');
    });
  });

  describe('return value structure', () => {
    it('always returns an object with bg and text properties', () => {
      for (const category of ['domain', 'method', 'topic', 'other', '']) {
        const style = getTagStyle(category);
        expect(style).toHaveProperty('bg');
        expect(style).toHaveProperty('text');
        expect(typeof style.bg).toBe('string');
        expect(typeof style.text).toBe('string');
      }
    });

    it('bg and text are non-empty strings', () => {
      for (const category of ['domain', 'method', 'topic']) {
        const style = getTagStyle(category);
        expect(style.bg.length).toBeGreaterThan(0);
        expect(style.text.length).toBeGreaterThan(0);
      }
    });
  });
});
