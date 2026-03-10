import { describe, expect, it } from 'vitest';
import {
  tokenizeSearchQuery,
  matchesNormalSearchQuery,
  filterNormalSearchResults,
} from '../../src/shared/utils/search-match';

describe('tokenizeSearchQuery', () => {
  it('splits by whitespace', () => {
    expect(tokenizeSearchQuery('attention transformer')).toEqual(['attention', 'transformer']);
  });

  it('lowercases tokens', () => {
    expect(tokenizeSearchQuery('Attention Transformer')).toEqual(['attention', 'transformer']);
  });

  it('trims leading and trailing whitespace', () => {
    expect(tokenizeSearchQuery('  attention  ')).toEqual(['attention']);
  });

  it('filters out empty tokens from multiple spaces', () => {
    expect(tokenizeSearchQuery('attention   transformer')).toEqual(['attention', 'transformer']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenizeSearchQuery('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(tokenizeSearchQuery('   ')).toEqual([]);
  });

  it('handles single word', () => {
    expect(tokenizeSearchQuery('bert')).toEqual(['bert']);
  });

  it('handles tabs and newlines as separators', () => {
    expect(tokenizeSearchQuery('attention\ttransformer\nnlp')).toEqual([
      'attention',
      'transformer',
      'nlp',
    ]);
  });
});

describe('matchesNormalSearchQuery', () => {
  const paper = {
    title: 'Attention Is All You Need',
    tagNames: ['transformer', 'nlp'],
    abstract: 'We propose the Transformer architecture based on self-attention.',
  };

  describe('exact match', () => {
    it('matches query that is a substring of title', () => {
      expect(matchesNormalSearchQuery(paper, 'attention')).toBe(true);
    });

    it('matches query that is a substring of abstract', () => {
      expect(matchesNormalSearchQuery(paper, 'self-attention')).toBe(true);
    });

    it('matches query that is a tag name', () => {
      expect(matchesNormalSearchQuery(paper, 'transformer')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(matchesNormalSearchQuery(paper, 'ATTENTION')).toBe(true);
      expect(matchesNormalSearchQuery(paper, 'Transformer')).toBe(true);
    });
  });

  describe('multi-token match', () => {
    it('matches when all tokens are present', () => {
      expect(matchesNormalSearchQuery(paper, 'attention transformer')).toBe(true);
    });

    it('does not match when any token is absent', () => {
      expect(matchesNormalSearchQuery(paper, 'attention gpt')).toBe(false);
    });

    it('matches tokens across different fields (title + tag)', () => {
      expect(matchesNormalSearchQuery(paper, 'need nlp')).toBe(true);
    });
  });

  describe('empty / invalid inputs', () => {
    it('returns false for empty query', () => {
      expect(matchesNormalSearchQuery(paper, '')).toBe(false);
    });

    it('returns false for whitespace-only query', () => {
      expect(matchesNormalSearchQuery(paper, '   ')).toBe(false);
    });

    it('returns false when paper has no content', () => {
      const emptyPaper = { title: null, tagNames: null, abstract: null };
      expect(matchesNormalSearchQuery(emptyPaper, 'attention')).toBe(false);
    });

    it('returns false when query does not match', () => {
      expect(matchesNormalSearchQuery(paper, 'reinforcement learning')).toBe(false);
    });
  });

  describe('null/undefined fields', () => {
    it('handles paper with only title', () => {
      const titleOnly = { title: 'BERT Pre-training' };
      expect(matchesNormalSearchQuery(titleOnly, 'bert')).toBe(true);
      expect(matchesNormalSearchQuery(titleOnly, 'transformer')).toBe(false);
    });

    it('handles paper with only tags', () => {
      const tagsOnly = { tagNames: ['diffusion', 'generation'] };
      expect(matchesNormalSearchQuery(tagsOnly, 'diffusion')).toBe(true);
    });

    it('handles paper with only abstract', () => {
      const abstractOnly = { abstract: 'A novel approach to image generation.' };
      expect(matchesNormalSearchQuery(abstractOnly, 'image')).toBe(true);
    });
  });
});

describe('filterNormalSearchResults', () => {
  const papers = [
    {
      id: '1',
      title: 'Attention Is All You Need',
      tagNames: ['transformer', 'nlp'],
      abstract: 'Self-attention mechanism.',
    },
    {
      id: '2',
      title: 'BERT: Pre-training of Deep Bidirectional Transformers',
      tagNames: ['nlp', 'language-model'],
      abstract: 'Bidirectional encoder representations.',
    },
    {
      id: '3',
      title: 'Stable Diffusion for Image Generation',
      tagNames: ['diffusion', 'generative'],
      abstract: 'Score-based generative model for images.',
    },
    {
      id: '4',
      title: 'RL for Robot Manipulation',
      tagNames: ['robotics', 'reinforcement-learning'],
      abstract: 'Reinforcement learning in physical environments.',
    },
  ];

  it('returns matching papers for single token query', () => {
    const results = filterNormalSearchResults(papers, 'transformer');
    expect(results.map((p) => p.id)).toContain('1');
    expect(results.map((p) => p.id)).toContain('2'); // "Transformers" in title
  });

  it('returns only matching papers for specific query', () => {
    const results = filterNormalSearchResults(papers, 'diffusion');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('3');
  });

  it('returns empty array when nothing matches', () => {
    const results = filterNormalSearchResults(papers, 'quantum computing');
    expect(results).toHaveLength(0);
  });

  it('returns all papers when query matches all', () => {
    // All papers have some content; a very broad term
    const results = filterNormalSearchResults(papers, 'a');
    // 'a' is a substring of many words
    expect(results.length).toBeGreaterThan(0);
  });

  it('preserves original paper objects in results', () => {
    const results = filterNormalSearchResults(papers, 'robotics');
    expect(results[0]).toBe(papers[3]); // Same reference
  });

  it('handles empty papers array', () => {
    const results = filterNormalSearchResults([], 'attention');
    expect(results).toHaveLength(0);
  });

  it('filters by tag name', () => {
    const results = filterNormalSearchResults(papers, 'reinforcement-learning');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('4');
  });

  it('multi-token query filters correctly', () => {
    const results = filterNormalSearchResults(papers, 'bert nlp');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('2');
  });
});
