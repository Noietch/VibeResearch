import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  className?: string;
  proseClassName?: string;
}

function getLanguageLabel(className?: string): string | null {
  if (!className) return null;
  const match = className.match(/language-([\w-]+)/i);
  if (!match) return null;
  return match[1];
}

function normalizeCode(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(normalizeCode).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return normalizeCode((children as { props?: { children?: ReactNode } }).props?.children ?? '');
  }
  return '';
}

function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = getLanguageLabel(className);
  const code = useMemo(() => normalizeCode(children).replace(/\n$/, ''), [children]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/95 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-300">
        <span className="rounded bg-slate-800 px-2 py-1 font-medium text-slate-200">
          {language ?? 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded bg-slate-800 px-2.5 py-1 font-medium text-slate-200 transition hover:bg-slate-700"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownContent({ content, className, proseClassName }: MarkdownContentProps) {
  return (
    <div className={['markdown-content', className].filter(Boolean).join(' ')}>
      <div className={proseClassName ?? 'prose prose-sm max-w-none break-words'}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { detect: true }]]}
          components={{
            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
            code: ({ node: _node, className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code className="rounded bg-black/5 px-1 py-0.5" {...props}>
                    {children}
                  </code>
                );
              }

              return <CodeBlock className={className}>{children}</CodeBlock>;
            },
            pre: ({ node: _node, children }) => <>{children}</>,
            table: ({ node: _node, ...props }) => (
              <div className="my-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm" {...props} />
              </div>
            ),
            th: ({ node: _node, ...props }) => (
              <th
                className="border border-notion-border bg-notion-sidebar px-3 py-2 text-left font-semibold"
                {...props}
              />
            ),
            td: ({ node: _node, ...props }) => (
              <td className="border border-notion-border px-3 py-2 align-top" {...props} />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
