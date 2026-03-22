import { useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import type { SearchMatch } from './use-pdf-search';

interface PdfSearchBarProps {
  query: string;
  currentMatchIndex: number;
  totalMatches: number;
  isSearching: boolean;
  onSearch: (query: string) => void;
  onNext: () => SearchMatch | null;
  onPrev: () => SearchMatch | null;
  onClear: () => void;
  onGoToMatch: (match: SearchMatch | null) => void;
  onClose: () => void;
}

export function PdfSearchBar({
  query,
  currentMatchIndex,
  totalMatches,
  isSearching,
  onSearch,
  onNext,
  onPrev,
  onClear,
  onGoToMatch,
  onClose,
}: PdfSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return;

      if (e.key === 'Escape') {
        onClear();
        onClose();
      } else if (e.key === 'Enter') {
        if (e.shiftKey) {
          onGoToMatch(onPrev());
        } else {
          onGoToMatch(onNext());
        }
      }
    },
    [onClear, onClose, onNext, onPrev, onGoToMatch],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearch(e.target.value);
    },
    [onSearch],
  );

  const handleClose = useCallback(() => {
    onClear();
    onClose();
  }, [onClear, onClose]);

  return (
    <div className="flex h-9 items-center gap-2 border-b border-notion-border bg-white px-3">
      <Search size={14} className="shrink-0 text-notion-text-tertiary" />

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Find in document..."
        className="min-w-0 flex-1 bg-transparent text-sm text-notion-text outline-none placeholder:text-notion-text-tertiary"
      />

      {query && (
        <span className="shrink-0 text-xs text-notion-text-tertiary">
          {isSearching
            ? 'Searching...'
            : totalMatches > 0
              ? `${currentMatchIndex + 1} / ${totalMatches}`
              : 'No results'}
        </span>
      )}

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onGoToMatch(onPrev())}
          disabled={totalMatches === 0}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-notion-sidebar disabled:opacity-50"
          title="Previous match"
        >
          <ChevronUp size={14} className="text-notion-text-secondary" />
        </button>
        <button
          onClick={() => onGoToMatch(onNext())}
          disabled={totalMatches === 0}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-notion-sidebar disabled:opacity-50"
          title="Next match"
        >
          <ChevronDown size={14} className="text-notion-text-secondary" />
        </button>
      </div>

      <button
        onClick={handleClose}
        className="flex h-6 w-6 items-center justify-center rounded hover:bg-notion-sidebar"
        title="Close search"
      >
        <X size={14} className="text-notion-text-secondary" />
      </button>
    </div>
  );
}
