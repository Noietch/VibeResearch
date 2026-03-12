import { useState, useEffect, useRef } from 'react';

interface PdfViewerIframeProps {
  /** Local file path (not URL) */
  path: string;
  /** Callback when file is not found, allowing parent to show download UI */
  onFileNotFound?: () => void;
}

/**
 * PDF viewer using PDF.js viewer (full-featured)
 * Supports native scroll, zoom, search (Ctrl+F), page navigation, etc.
 */
export function PdfViewerIframe({ path, onFileNotFound }: PdfViewerIframeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onFileNotFoundRef = useRef(onFileNotFound);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Update onFileNotFound ref
  useEffect(() => {
    onFileNotFoundRef.current = onFileNotFound;
  }, [onFileNotFound]);

  // Load PDF data
  useEffect(() => {
    let isMounted = true;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      // Cleanup previous data URL
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

        // Create blob URL for iframe (more reliable than data URL)
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        cleanupRef.current = () => URL.revokeObjectURL(url);
        setPdfDataUrl(url);
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
    <div className="relative h-full w-full bg-[#525659]">
      {pdfDataUrl && (
        <embed
          src={pdfDataUrl}
          type="application/pdf"
          className="h-full w-full border-0"
          title="PDF Viewer"
        />
      )}
    </div>
  );
}
