import { PdfDocument, type CachedReference } from './pdf/PdfDocument';
import type { HighlightItem } from '../hooks/use-ipc';

interface PdfViewerProps {
  path: string;
  paperId?: string;
  cachedReferences?: CachedReference[];
  onReferencesExtracted?: (refs: CachedReference[]) => void;
  onFileNotFound?: () => void;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
  onAskAI?: (text: string) => void;
  highlights?: HighlightItem[];
  onCreateHighlight?: (params: {
    pageNumber: number;
    rectsJson: string;
    text: string;
    color: string;
    note?: string;
  }) => void;
  onDeleteHighlight?: (id: string) => void;
  onUpdateHighlight?: (id: string, params: { color?: string }) => void;
  onOpenUrl?: (url: string) => void;
  onSearchPaper?: (query: string) => void;
  showCitationSidebar?: boolean;
  onToggleCitationSidebar?: () => void;
  showAIOutlineSidebar?: boolean;
  onToggleAIOutlineSidebar?: () => void;
  shortId?: string;
  goToPageRef?: React.MutableRefObject<((page: number) => void) | null>;
}

export function PdfViewer({
  path,
  paperId,
  cachedReferences,
  onReferencesExtracted,
  onFileNotFound,
  initialPage,
  onPageChange,
  onAskAI,
  highlights,
  onCreateHighlight,
  onDeleteHighlight,
  onUpdateHighlight,
  onOpenUrl,
  onSearchPaper,
  showCitationSidebar,
  onToggleCitationSidebar,
  showAIOutlineSidebar,
  onToggleAIOutlineSidebar,
  shortId,
  goToPageRef,
}: PdfViewerProps) {
  return (
    <PdfDocument
      path={path}
      paperId={paperId}
      cachedReferences={cachedReferences}
      onReferencesExtracted={onReferencesExtracted}
      onFileNotFound={onFileNotFound}
      initialPage={initialPage}
      onPageChange={onPageChange}
      onAskAI={onAskAI}
      highlights={highlights}
      onCreateHighlight={onCreateHighlight}
      onDeleteHighlight={onDeleteHighlight}
      onUpdateHighlight={onUpdateHighlight}
      onOpenUrl={onOpenUrl}
      onSearchPaper={onSearchPaper}
      showCitationSidebar={showCitationSidebar}
      onToggleCitationSidebar={onToggleCitationSidebar}
      showAIOutlineSidebar={showAIOutlineSidebar}
      onToggleAIOutlineSidebar={onToggleAIOutlineSidebar}
      shortId={shortId}
      goToPageRef={goToPageRef}
    />
  );
}
