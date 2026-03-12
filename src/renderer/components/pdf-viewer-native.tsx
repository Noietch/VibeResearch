import { useState, useEffect, useRef } from 'react';

interface PdfViewerNativeProps {
  /** Local file path (not URL) */
  path: string;
  /** Callback when file is not found, allowing parent to show download UI */
  onFileNotFound?: () => void;
}

/**
 * Native Chrome PDF viewer - no libraries, just <embed>
 * Chrome handles everything: scroll, zoom, search, navigation
 */
export function PdfViewerNative({ path, onFileNotFound }: PdfViewerNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<HTMLEmbedElement>(null);
  const onFileNotFoundRef = useRef(onFileNotFound);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Update onFileNotFound ref
  useEffect(() => {
    onFileNotFoundRef.current = onFileNotFound;
  }, [onFileNotFound]);

  // Handle pinch-to-zoom with trackpad
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Check if it's a pinch gesture (ctrlKey is set for pinch on trackpad)
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        // Pinch zoom
        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? 1.05 : 0.95;

        setScale((prevScale) => {
          const newScale = Math.max(0.5, Math.min(3.0, prevScale * zoomFactor));
          return newScale;
        });
      }
    };

    // CRITICAL: { passive: false } allows preventDefault to work
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Load PDF data
  useEffect(() => {
    let isMounted = true;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      // Cleanup previous blob URL
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      try {
        const filePath = path.replace(/^local-file:\/\//, '');
        if (!window.electronAPI) {
          throw new Error('Electron file API unavailable');
        }
        const base64 = await window.electronAPI.readLocalFile(filePath);
        if (!isMounted) return;

        // Convert base64 to Uint8Array
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        // Create blob URL for Chrome's native PDF viewer
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // Add URL fragment to hide toolbar by default
        const urlWithoutToolbar = `${url}#toolbar=0&navpanes=0`;

        cleanupRef.current = () => URL.revokeObjectURL(url);
        setPdfUrl(urlWithoutToolbar);
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        const errorMsg = err instanceof Error ? err.message : 'Failed to load PDF';
        if (errorMsg === 'File not found' && onFileNotFoundRef.current) {
          onFileNotFoundRef.current();
          return;
        }
        setError(errorMsg);
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [path]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#525659]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#525659] p-4">
        <div className="text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto">
      {pdfUrl && (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.05s ease-out',
            minHeight: '100%',
            minWidth: '100%',
          }}
        >
          <embed
            ref={embedRef}
            src={pdfUrl}
            type="application/pdf"
            style={{
              border: 'none',
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      )}
    </div>
  );
}
