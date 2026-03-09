import { ipcMain, dialog } from 'electron';
import { CitationExtractionService } from '../services/citation-extraction.service';
import { CitationGraphService } from '../services/citation-graph.service';
import { CitationsRepository } from '@db';
import { type IpcResult, ok, err } from '@shared';
import fs from 'fs';

let extractionService: CitationExtractionService | null = null;
let graphService: CitationGraphService | null = null;
let citationsRepo: CitationsRepository | null = null;

function getExtractionService() {
  if (!extractionService) extractionService = new CitationExtractionService();
  return extractionService;
}

function getGraphService() {
  if (!graphService) graphService = new CitationGraphService();
  return graphService;
}

function getRepo() {
  if (!citationsRepo) citationsRepo = new CitationsRepository();
  return citationsRepo;
}

export function setupCitationsIpc() {
  ipcMain.handle(
    'citations:extract',
    async (
      _,
      paper: { id: string; shortId: string; title: string; sourceUrl?: string | null },
    ): Promise<IpcResult<unknown>> => {
      try {
        const result = await getExtractionService().extractForPaper(paper);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[citations:extract] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle(
    'citations:getForPaper',
    async (_, paperId: string): Promise<IpcResult<unknown>> => {
      try {
        const [refs, citedBy] = await Promise.all([
          getRepo().findBySource(paperId),
          getRepo().findByTarget(paperId),
        ]);
        return ok({ references: refs, citedBy });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[citations:getForPaper] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle(
    'citations:getGraphData',
    async (_, options?: { includeGhostNodes?: boolean }): Promise<IpcResult<unknown>> => {
      try {
        const result = await getGraphService().getGraphData(options);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[citations:getGraphData] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle(
    'citations:getGraphForPaper',
    async (
      _,
      paperId: string,
      depth?: number,
      includeGhostNodes?: boolean,
    ): Promise<IpcResult<unknown>> => {
      try {
        const result = await getGraphService().getGraphForPaper(
          paperId,
          depth ?? 1,
          includeGhostNodes ?? true,
        );
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[citations:getGraphForPaper] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle(
    'citations:findPath',
    async (_, fromId: string, toId: string): Promise<IpcResult<unknown>> => {
      try {
        const path = await getGraphService().findCitationPath(fromId, toId);
        return ok(path);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[citations:findPath] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle('citations:resolveUnmatched', async (): Promise<IpcResult<unknown>> => {
    try {
      const resolved = await getExtractionService().resolveUnmatched();
      return ok({ resolved });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[citations:resolveUnmatched] Error:', msg);
      return err(msg);
    }
  });

  ipcMain.handle('citations:getCounts', async (_, paperId: string): Promise<IpcResult<unknown>> => {
    try {
      const [references, citedBy] = await Promise.all([
        getRepo().countBySource(paperId),
        getRepo().countByTarget(paperId),
      ]);
      return ok({ references, citedBy });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[citations:getCounts] Error:', msg);
      return err(msg);
    }
  });

  ipcMain.handle(
    'citations:exportGraph',
    async (_, graphData: unknown): Promise<IpcResult<unknown>> => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath: 'citation-graph.json',
          filters: [
            { name: 'JSON', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || !result.filePath) return ok({ saved: false });

        await fs.promises.writeFile(result.filePath, JSON.stringify(graphData, null, 2), 'utf-8');
        return ok({ saved: true, filePath: result.filePath });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[citations:exportGraph] Error:', msg);
        return err(msg);
      }
    },
  );
}
