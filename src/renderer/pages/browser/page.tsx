import { useSearchParams } from 'react-router-dom';

export function BrowserPage() {
  const [params] = useSearchParams();
  const url = params.get('url') ?? '';

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-notion-text-tertiary">No URL provided</p>
      </div>
    );
  }

  return (
    <webview
      src={url}
      className="h-full w-full"
      // @ts-expect-error webview attributes
      allowpopups="true"
    />
  );
}
