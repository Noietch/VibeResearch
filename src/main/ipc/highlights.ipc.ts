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
      params: { note?: string; color?: string },
    ): Promise<IpcResult<unknown>> => {
      try {
        const highlight = await getRepo().update(id, params);
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
}
