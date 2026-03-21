/**
 * AI-powered paper summary generation service.
 * Generates AlphaXiv-style structured overviews for ANY paper (arXiv or not)
 * using the user's configured LLM provider.
 */

import fs from 'fs/promises';
import path from 'path';
import { getPapersDir } from '../store/app-settings-store';
import { getPaperText } from './paper-text.service';
import { streamWithActiveProvider } from './ai-provider.service';
import { getPaperSummarySystemPrompt, buildPaperSummaryUserPrompt } from '@shared';

const AI_SUMMARY_FILENAME = 'ai-summary.md';

function getSummaryFilePath(shortId: string): string {
  return path.join(getPapersDir(), shortId, AI_SUMMARY_FILENAME);
}

/**
 * Get a cached AI summary for a paper, if one exists.
 */
export async function getCachedAiSummary(shortId: string): Promise<string | null> {
  try {
    const filePath = getSummaryFilePath(shortId);
    const content = await fs.readFile(filePath, 'utf-8');
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Delete the cached AI summary for a paper (for regeneration).
 */
export async function deleteCachedAiSummary(shortId: string): Promise<void> {
  try {
    const filePath = getSummaryFilePath(shortId);
    await fs.unlink(filePath);
  } catch {
    // ignore if file doesn't exist
  }
}

/**
 * Generate an AI summary for a paper using streaming.
 * Calls onChunk for each text chunk received.
 * The final summary is cached to papers/{shortId}/ai-summary.md.
 */
export async function generateAiSummary(
  paperId: string,
  shortId: string,
  title: string,
  onChunk: (chunk: string) => void,
  options: {
    abstract?: string;
    pdfUrl?: string;
    pdfPath?: string;
    language?: 'en' | 'zh';
    signal?: AbortSignal;
    onPhase?: (phase: string) => void;
  } = {},
): Promise<string> {
  const { abstract, pdfUrl, pdfPath, language = 'en', signal, onPhase } = options;

  // Step 1: Get full paper text (from cache or PDF extraction)
  onPhase?.('extracting');
  let paperText = await getPaperText(paperId, shortId, pdfUrl, pdfPath);

  // If cached text is empty, force a fresh extraction
  if (!paperText || paperText.trim().length < 100) {
    console.log('[paper-summary] Cached text too short, forcing re-extraction...');
    paperText = await getPaperText(paperId, shortId, pdfUrl, pdfPath, {
      forceRefresh: true,
    });
  }

  const hasSubstantialText = paperText && paperText.trim().length >= 100;
  const hasAbstract = abstract && abstract.trim().length > 0;

  if (!hasSubstantialText && !hasAbstract) {
    throw new Error(
      'No paper text available for summary generation. ' +
        'Make sure the PDF has been downloaded and text extraction has completed.',
    );
  }

  if (!hasSubstantialText) {
    console.warn(`[paper-summary] Paper text is empty/short for ${shortId}, using abstract only`);
  }

  // Step 2: Build prompts
  onPhase?.('generating');
  const systemPrompt = getPaperSummarySystemPrompt(language);
  const userPrompt = buildPaperSummaryUserPrompt(title, paperText || '', abstract);
  console.log(
    `[paper-summary] Sending to LLM: title=${title.length}chars, text=${(paperText || '').length}chars, abstract=${(abstract || '').length}chars`,
  );

  // Step 3: Generate with streaming LLM
  const summary = await streamWithActiveProvider(systemPrompt, userPrompt, onChunk, signal);

  if (!summary || summary.trim().length === 0) {
    throw new Error('LLM returned empty summary');
  }

  // Step 4: Cache to file
  const filePath = getSummaryFilePath(shortId);
  const folder = path.dirname(filePath);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(filePath, summary.trim(), 'utf-8');

  return summary.trim();
}
