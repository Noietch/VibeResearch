import { ipcMain } from 'electron';
import { AcpChatService } from '../services/acp-chat.service';
import { type IpcResult, ok, err } from '@shared';

let svc: AcpChatService | null = null;

function getService() {
  if (!svc) svc = new AcpChatService();
  return svc;
}

export function setupAcpChatIpc() {
  // ── Sessions ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'acp-chat:session:create',
    async (
      _,
      input: {
        projectId: string;
        title: string;
        paperIds?: string[];
        repoIds?: string[];
        backend?: string | null;
        cwd?: string | null;
        sessionMode?: string | null;
      },
    ): Promise<IpcResult<unknown>> => {
      try {
        const result = await getService().createSession(input);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[acp-chat:session:create] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle(
    'acp-chat:session:list',
    async (_, projectId: string): Promise<IpcResult<unknown>> => {
      try {
        const result = await getService().listSessionsByProject(projectId);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[acp-chat:session:list] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle('acp-chat:session:get', async (_, id: string): Promise<IpcResult<unknown>> => {
    try {
      const result = await getService().getSession(id);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[acp-chat:session:get] Error:', msg);
      return err(msg);
    }
  });

  ipcMain.handle(
    'acp-chat:session:updateTitle',
    async (_, id: string, title: string): Promise<IpcResult<unknown>> => {
      try {
        const result = await getService().updateSessionTitle(id, title);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[acp-chat:session:updateTitle] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle('acp-chat:session:delete', async (_, id: string): Promise<IpcResult<unknown>> => {
    try {
      const result = await getService().deleteSession(id);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[acp-chat:session:delete] Error:', msg);
      return err(msg);
    }
  });

  // ── Messages ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'acp-chat:message:list',
    async (_, sessionId: string): Promise<IpcResult<unknown>> => {
      try {
        const result = await getService().getMessagesBySession(sessionId);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[acp-chat:message:list] Error:', msg);
        return err(msg);
      }
    },
  );

  // ── Unified Chat (Lightweight + ACP) ──────────────────────────────────────

  ipcMain.handle(
    'acp-chat:send',
    async (
      _,
      input: {
        chatSessionId: string;
        projectId: string;
        paperIds: string[];
        repoIds?: string[];
        prompt: string;
        backend?: string | null;
        cwd?: string;
        language?: 'en' | 'zh';
      },
    ): Promise<IpcResult<{ jobId: string; started: boolean }>> => {
      try {
        const result = await getService().sendMessage(input);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[acp-chat:send] Error:', msg);
        return err(msg);
      }
    },
  );

  ipcMain.handle('acp-chat:kill', async (_, jobId: string): Promise<IpcResult<unknown>> => {
    try {
      const killed = getService().killJob(jobId);
      return ok({ killed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[acp-chat:kill] Error:', msg);
      return err(msg);
    }
  });

  ipcMain.handle(
    'acp-chat:permission:respond',
    async (_, jobId: string, requestId: number, optionId: string): Promise<IpcResult<unknown>> => {
      try {
        await getService().respondToPermission(jobId, requestId, optionId);
        return ok({ responded: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[acp-chat:permission:respond] Error:', msg);
        return err(msg);
      }
    },
  );

  // ── Title Generation ──────────────────────────────────────────────────────

  ipcMain.handle(
    'acp-chat:generateTitle',
    async (_, content: string): Promise<IpcResult<unknown>> => {
      try {
        const result = await getService().generateTitleFromMessage(content);
        return ok(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[acp-chat:generateTitle] Error:', msg);
        return err(msg);
      }
    },
  );
}
