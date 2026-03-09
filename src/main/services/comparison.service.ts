import { PapersRepository } from '@db';
import {
  COMPARISON_SYSTEM_PROMPT,
  buildComparisonUserPrompt,
  type ComparisonPaperInput,
} from '@shared';
import { getLanguageModelFromConfig, streamText } from './ai-provider.service';
import { getActiveModel, getModelWithKey } from '../store/model-config-store';
import { getPaperExcerptCached } from './paper-text.service';

export class ComparisonService {
  private papersRepository = new PapersRepository();

  async comparePapers(
    input: { paperIds: string[] },
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    onProgress?: (message: string) => void,
  ): Promise<string> {
    if (input.paperIds.length < 2 || input.paperIds.length > 3) {
      throw new Error('Comparison requires 2 or 3 papers');
    }

    const modelConfig = getActiveModel('chat');
    if (!modelConfig) {
      throw new Error('No chat model configured. Please set up a chat model in Settings.');
    }

    const configWithKey = getModelWithKey(modelConfig.id);
    if (!configWithKey?.apiKey) {
      throw new Error('No API key configured for the chat model.');
    }

    const model = getLanguageModelFromConfig(configWithKey);

    // Fetch all papers
    onProgress?.('Loading paper metadata…');
    const papers = await Promise.all(
      input.paperIds.map((id) => this.papersRepository.findById(id)),
    );

    // Build comparison input with optional PDF excerpts (sequentially for progress)
    const comparisonInputs: ComparisonPaperInput[] = [];
    for (let i = 0; i < papers.length; i++) {
      const paper = papers[i];
      onProgress?.(`Reading paper ${i + 1}/${papers.length}: ${paper.title.slice(0, 60)}…`);
      let pdfExcerpt = '';
      if (paper.shortId && (paper.pdfUrl || paper.pdfPath)) {
        try {
          pdfExcerpt = await getPaperExcerptCached(
            paper.id,
            paper.shortId,
            paper.pdfUrl ?? undefined,
            paper.pdfPath ?? undefined,
            3000,
          );
        } catch {
          // PDF extraction failed, continue without it
        }
      }

      comparisonInputs.push({
        title: paper.title,
        authors: (paper.authors as string[]) ?? [],
        year: paper.submittedAt ? new Date(paper.submittedAt).getFullYear() : null,
        abstract: paper.abstract ?? undefined,
        pdfExcerpt: pdfExcerpt || undefined,
      });
    }

    onProgress?.('Sending to AI model…');

    const userPrompt = buildComparisonUserPrompt(comparisonInputs);

    const { textStream } = streamText({
      model,
      system: COMPARISON_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxTokens: 4096,
      abortSignal: signal,
    });

    let fullText = '';
    for await (const chunk of textStream) {
      fullText += chunk;
      onChunk(chunk);
    }

    return fullText;
  }

  async translateComparison(
    contentMd: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const modelConfig = getActiveModel('lightweight');
    if (!modelConfig) {
      throw new Error(
        'No lightweight model configured. Please set up a lightweight model in Settings.',
      );
    }

    const configWithKey = getModelWithKey(modelConfig.id);
    if (!configWithKey?.apiKey) {
      throw new Error('No API key configured for the lightweight model.');
    }

    const model = getLanguageModelFromConfig(configWithKey);

    const { textStream } = streamText({
      model,
      system:
        'Translate the following academic comparison into Chinese. Keep markdown formatting, headings, and structure. Translate naturally, not literally. Do not add any extra content or commentary.',
      prompt: contentMd,
      maxTokens: 8192,
      abortSignal: signal,
    });

    let fullText = '';
    for await (const chunk of textStream) {
      fullText += chunk;
      onChunk(chunk);
    }

    return fullText;
  }
}
