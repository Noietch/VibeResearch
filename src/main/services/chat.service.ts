import { ChatRepository, PapersRepository } from '@db';
import {
  generateWithModelKind,
  getLanguageModelFromConfig,
  streamText,
} from './ai-provider.service';
import { getActiveModel, getModelWithKey } from '../store/model-config-store';
import { getChatSystemPrompt, getChatContextIntro, getChatContextResponse } from '@shared';

export class ChatService {
  private repo = new ChatRepository();
  private papersRepo = new PapersRepository();

  // ── Sessions ──────────────────────────────────────────────────────────────

  async createSession(input: {
    projectId: string;
    title: string;
    paperIds?: string[];
    repoIds?: string[];
  }) {
    return this.repo.createSession(input);
  }

  async getSession(id: string) {
    const session = await this.repo.getSession(id);
    if (!session) return null;
    return {
      ...session,
      paperIds: JSON.parse(session.paperIdsJson) as string[],
      repoIds: JSON.parse(session.repoIdsJson) as string[],
    };
  }

  async listSessionsByProject(projectId: string) {
    const sessions = await this.repo.listSessionsByProject(projectId);
    return sessions.map((s) => ({
      ...s,
      paperIds: JSON.parse(s.paperIdsJson) as string[],
      repoIds: JSON.parse(s.repoIdsJson) as string[],
    }));
  }

  async updateSessionTitle(id: string, title: string) {
    return this.repo.updateSessionTitle(id, title);
  }

  async deleteSession(id: string) {
    return this.repo.deleteSession(id);
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async addMessage(input: { sessionId: string; role: 'user' | 'assistant'; content: string }) {
    return this.repo.addMessage(input);
  }

  async getMessagesBySession(sessionId: string) {
    return this.repo.getMessagesBySession(sessionId);
  }

  // ── Chat with AI ──────────────────────────────────────────────────────────

  async chat(
    input: {
      sessionId: string;
      projectId: string;
      paperIds: string[];
      repoIds?: string[];
      messages: { role: 'user' | 'assistant'; content: string }[];
      language?: 'en' | 'zh';
    },
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    // Fetch paper details
    const papers = await Promise.all(
      input.paperIds.map((id) => this.papersRepo.findById(id).catch(() => null)),
    );
    const validPapers = papers.filter(Boolean) as Awaited<
      ReturnType<PapersRepository['findById']>
    >[];

    const paperContext = validPapers
      .map((p) => {
        const parts = [`Title: ${p!.title}`];
        if (p!.abstract) parts.push(`Abstract: ${p!.abstract}`);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    const modelConfig = getActiveModel('lightweight');
    if (!modelConfig) {
      throw new Error('No lightweight model configured. Please set up a model in Settings.');
    }
    const configWithKey = getModelWithKey(modelConfig.id);
    if (!configWithKey) throw new Error('Model config not found');
    const model = getLanguageModelFromConfig(configWithKey);

    const language = input.language ?? 'en';
    const systemPrompt = getChatSystemPrompt(language);

    const contextParts: string[] = [];
    if (paperContext) contextParts.push('Papers:\n' + paperContext);
    const contextStr = contextParts.join('\n\n');

    const formattedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (contextStr) {
      formattedMessages.push(
        {
          role: 'user',
          content: `${contextStr}\n\n${getChatContextIntro(language)}`,
        },
        {
          role: 'assistant',
          content: getChatContextResponse(language),
        },
      );
    }

    formattedMessages.push(...input.messages);

    const { textStream } = streamText({
      model,
      system: systemPrompt,
      messages: formattedMessages,
      maxOutputTokens: 4096,
      abortSignal: signal,
    });

    let fullText = '';
    for await (const chunk of textStream) {
      fullText += chunk;
      onChunk(chunk);
    }

    return fullText;
  }

  // ── Generate Title ────────────────────────────────────────────────────────

  async generateTitleFromMessage(content: string): Promise<string> {
    const systemPrompt = [
      'You are a helpful assistant that generates short, concise titles for chat conversations.',
      'Given a user message, generate a title of maximum 6 words that summarizes the topic.',
      'Return ONLY the title text, no quotes, no explanation.',
    ].join(' ');

    try {
      const response = await generateWithModelKind(
        'lightweight',
        systemPrompt,
        `Generate a short title for this message: ${content.slice(0, 200)}`,
      );
      return response
        .trim()
        .replace(/^["']|["']$/g, '')
        .slice(0, 50);
    } catch {
      return 'New Chat';
    }
  }
}
