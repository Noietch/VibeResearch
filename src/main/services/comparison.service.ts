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
    const papers = await Promise.all(
      input.paperIds.map((id) => this.papersRepository.findById(id)),
    );

    // Build comparison input with optional PDF excerpts
    const comparisonInputs: ComparisonPaperInput[] = await Promise.all(
      papers.map(async (paper) => {
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

        return {
          title: paper.title,
          authors: (paper.authors as string[]) ?? [],
          year: paper.submittedAt ? new Date(paper.submittedAt).getFullYear() : null,
          abstract: paper.abstract ?? undefined,
          pdfExcerpt: pdfExcerpt || undefined,
        };
      }),
    );

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
}
