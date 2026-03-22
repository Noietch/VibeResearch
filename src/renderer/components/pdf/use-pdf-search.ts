import { useState, useCallback, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface SearchMatch {
  pageNumber: number;
  /** Index of this match within the page (0-based) */
  matchIndexInPage: number;
  /** Global index across all pages */
  index: number;
}

interface UsePdfSearchResult {
  query: string;
  matches: SearchMatch[];
  currentMatchIndex: number;
  totalMatches: number;
  isSearching: boolean;
  search: (query: string) => Promise<void>;
  searchNext: () => SearchMatch | null;
  searchPrev: () => SearchMatch | null;
  clearSearch: () => void;
}

export function usePdfSearch(document: PDFDocumentProxy | null): UsePdfSearchResult {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const searchIdRef = useRef(0);

  const search = useCallback(
    async (q: string) => {
      setQuery(q);

      if (!q.trim() || !document) {
        setMatches([]);
        setCurrentMatchIndex(-1);
        return;
      }

      const searchId = ++searchIdRef.current;
      setIsSearching(true);

      const needle = q.toLowerCase();
      const found: SearchMatch[] = [];

      for (let pageNum = 1; pageNum <= document.numPages; pageNum++) {
        if (searchIdRef.current !== searchId) return;

        const page = await document.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .toLowerCase();

        let startIdx = 0;
        let pos: number;
        let matchIndexInPage = 0;
        while ((pos = pageText.indexOf(needle, startIdx)) !== -1) {
          found.push({ pageNumber: pageNum, matchIndexInPage, index: found.length });
          matchIndexInPage++;
          startIdx = pos + 1;
        }
      }

      if (searchIdRef.current !== searchId) return;

      setMatches(found);
      setCurrentMatchIndex(found.length > 0 ? 0 : -1);
      setIsSearching(false);
    },
    [document],
  );

  const searchNext = useCallback((): SearchMatch | null => {
    if (matches.length === 0) return null;
    const next = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(next);
    return matches[next];
  }, [matches, currentMatchIndex]);

  const searchPrev = useCallback((): SearchMatch | null => {
    if (matches.length === 0) return null;
    const prev = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prev);
    return matches[prev];
  }, [matches, currentMatchIndex]);

  const clearSearch = useCallback(() => {
    searchIdRef.current++;
    setQuery('');
    setMatches([]);
    setCurrentMatchIndex(-1);
    setIsSearching(false);
  }, []);

  return {
    query,
    matches,
    currentMatchIndex,
    totalMatches: matches.length,
    isSearching,
    search,
    searchNext,
    searchPrev,
    clearSearch,
  };
}
