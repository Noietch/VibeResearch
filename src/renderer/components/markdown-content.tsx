import { useMemo } from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
  proseClassName?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(value: string): string {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1<em>$2</em>');
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return text;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let inUnorderedList = false;
  let inOrderedList = false;
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const closeLists = () => {
    if (inUnorderedList) {
      parts.push('</ul>');
      inUnorderedList = false;
    }
    if (inOrderedList) {
      parts.push('</ol>');
      inOrderedList = false;
    }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock) {
      parts.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines = [];
      inCodeBlock = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      closeLists();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeLists();
      parts.push('<p></p>');
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      parts.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      closeLists();
      parts.push('<hr />');
      continue;
    }

    if (trimmed.startsWith('> ')) {
      closeLists();
      parts.push(`<blockquote><p>${renderInline(trimmed.slice(2))}</p></blockquote>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (inUnorderedList) {
        parts.push('</ul>');
        inUnorderedList = false;
      }
      if (!inOrderedList) {
        parts.push('<ol>');
        inOrderedList = true;
      }
      parts.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.*)$/);
    if (unordered) {
      if (inOrderedList) {
        parts.push('</ol>');
        inOrderedList = false;
      }
      if (!inUnorderedList) {
        parts.push('<ul>');
        inUnorderedList = true;
      }
      parts.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    closeLists();
    parts.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeLists();
  flushCodeBlock();
  return parts.join('');
}

export function MarkdownContent({ content, className, proseClassName }: MarkdownContentProps) {
  const html = useMemo(() => markdownToHtml(content || ''), [content]);

  return (
    <div className={className}>
      <div
        className={proseClassName ?? 'prose prose-sm max-w-none break-words'}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
