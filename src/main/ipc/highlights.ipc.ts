import { ipcMain } from 'electron';
import { HighlightsRepository } from '@db';

type IpcResult<T> = { success: true; data: T } | { success: false; error: string };

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}
function err<T>(error: string): IpcResult<T> {
  return { success: false, error };
}

let repo: HighlightsRepository | null = null;
function getRepo() {
  if (!repo) repo = new HighlightsRepository();
  return repo;
}

export function setupHighlightsIpc() {
  ipcMain.handle(
    'highlights:create',
    async (
      _,
      params: {
        paperId: string;
        pageNumber: number;
        rectsJson: string;
        text: string;
        note?: string;
        color?: string;
      },
    ): Promise<IpcResult<unknown>> => {
      try {
        const highlight = await getRepo().create(params);
        return ok(highlight);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  ipcMain.handle(
    'highlights:update',
    async (
      _,
      id: string,
      params: { note?: string; aiNote?: string; color?: string },
    ): Promise<IpcResult<unknown>> => {
      try {
        const highlight = await getRepo().update(id, params);
        return ok(highlight);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  ipcMain.handle(
    'highlights:addNote',
    async (_, id: string, text: string): Promise<IpcResult<unknown>> => {
      try {
        const highlight = await getRepo().addNote(id, text);
        return ok(highlight);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  ipcMain.handle(
    'highlights:updateNote',
    async (_, id: string, noteId: string, text: string): Promise<IpcResult<unknown>> => {
      try {
        const highlight = await getRepo().updateNote(id, noteId, text);
        return ok(highlight);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  ipcMain.handle(
    'highlights:deleteNote',
    async (_, id: string, noteId: string): Promise<IpcResult<unknown>> => {
      try {
        const highlight = await getRepo().deleteNote(id, noteId);
        return ok(highlight);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  ipcMain.handle('highlights:delete', async (_, id: string): Promise<IpcResult<unknown>> => {
    try {
      await getRepo().delete(id);
      return ok(null);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });

  ipcMain.handle(
    'highlights:listByPaper',
    async (_, paperId: string): Promise<IpcResult<unknown>> => {
      try {
        const highlights = await getRepo().listByPaper(paperId);
        return ok(highlights);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  ipcMain.handle(
    'highlights:search',
    async (
      _,
      params: { query?: string; color?: string; limit?: number; offset?: number },
    ): Promise<IpcResult<unknown>> => {
      try {
        const results = await getRepo().search(params);
        console.log('[highlights:search] params:', params, 'results:', results.length);
        return ok(results);
      } catch (e) {
        console.error('[highlights:search] Error:', e);
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  ipcMain.handle(
    'highlights:exportMarkdown',
    async (_, paperId: string): Promise<IpcResult<unknown>> => {
      try {
        const { PapersRepository, ReadingRepository } = await import('@db');
        const papersRepo = new PapersRepository();
        const readingRepo = new ReadingRepository();

        const paper = await papersRepo.findById(paperId);
        if (!paper) return err('Paper not found');

        const highlights = await getRepo().listByPaper(paperId);
        const notes = await readingRepo.listByPaper(paperId);

        // Build markdown
        const lines: string[] = [];
        lines.push(`# ${paper.title}`);
        if (paper.authors.length > 0) {
          lines.push(`**Authors**: ${paper.authors.join(', ')}`);
        }
        lines.push('');

        if (highlights.length > 0) {
          lines.push('## Highlights');
          lines.push('');

          // Group by page
          const byPage = new Map<number, typeof highlights>();
          for (const h of highlights) {
            const group = byPage.get(h.pageNumber) ?? [];
            group.push(h);
            byPage.set(h.pageNumber, group);
          }

          for (const [page, items] of Array.from(byPage.entries()).sort((a, b) => a[0] - b[0])) {
            lines.push(`### Page ${page}`);
            lines.push('');
            for (const h of items) {
              lines.push(`> ${h.text.trim()} — *[${h.color}]*`);
              if (h.aiNote) {
                lines.push(`>  `);
                lines.push(`> **AI Note**: ${h.aiNote}`);
              }
              // Multi-note entries
              try {
                const noteEntries = JSON.parse(h.notes || '[]') as { text: string }[];
                for (const ne of noteEntries) {
                  lines.push(`>  `);
                  lines.push(`> **Note**: ${ne.text}`);
                }
              } catch {
                // fallback to legacy single note
                if (h.note) {
                  lines.push(`>  `);
                  lines.push(`> **Note**: ${h.note}`);
                }
              }
              lines.push('');
            }
          }
        }

        if (notes.length > 0) {
          lines.push('## Reading Notes');
          lines.push('');
          for (const note of notes) {
            lines.push(`### ${note.title}`);
            lines.push('');
            // Simple contentJson to text conversion
            try {
              const content = JSON.parse(note.contentJson);
              if (content?.content) {
                for (const node of content.content) {
                  lines.push(prosemirrorNodeToMarkdown(node));
                }
              }
            } catch {
              lines.push(note.contentJson);
            }
            lines.push('');
          }
        }

        return ok({ markdown: lines.join('\n') });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );
}

/** Simple ProseMirror/TipTap JSON node to Markdown converter */
function prosemirrorNodeToMarkdown(node: {
  type: string;
  content?: unknown[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string }>;
}): string {
  if (node.type === 'text') {
    let text = node.text ?? '';
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'bold') text = `**${text}**`;
        if (mark.type === 'italic') text = `*${text}*`;
        if (mark.type === 'code') text = `\`${text}\``;
      }
    }
    return text;
  }

  const children = (node.content ?? [])
    .map((c) => prosemirrorNodeToMarkdown(c as typeof node))
    .join('');

  switch (node.type) {
    case 'paragraph':
      return children + '\n';
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      return '#'.repeat(level) + ' ' + children + '\n';
    }
    case 'bulletList':
      return children;
    case 'orderedList':
      return children;
    case 'listItem':
      return '- ' + children;
    case 'codeBlock':
      return '```\n' + children + '\n```\n';
    case 'blockquote':
      return '> ' + children;
    default:
      return children;
  }
}
