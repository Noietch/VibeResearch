import { generateWithModelKind } from './ai-provider.service';
import { getPaperText } from './paper-text.service';
import { PapersRepository } from '../../db/repositories/papers.repository';
import {
  getReaderInlinePrompt,
  getPaperOutlinePrompt,
  getReadingSummaryPrompt,
} from '../../shared/prompts/reader-ai.prompt';
import { resolvePdfParseConstructor } from './pdf-extractor.service';
import fs from 'fs/promises';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaperOutline {
  researchQuestions: string[];
  methodology: string;
  keyFindings: string[];
  limitations: string[];
  contributions: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

// ─── Inline AI ──────────────────────────────────────────────────────────────

export async function inlineAI(params: {
  paperId: string;
  action: string;
  selectedText: string;
  pageNumber?: number;
  language: string;
}): Promise<{ result: string }> {
  const { action, selectedText, language } = params;
  const lang = language === 'zh' ? 'zh' : 'en';

  const systemPrompt = getReaderInlinePrompt(action, lang);
  const userPrompt = selectedText;

  const result = await generateWithModelKind('lightweight', systemPrompt, userPrompt, {
    strictSelection: true,
  });

  return { result };
}

// ─── Paper Outline ──────────────────────────────────────────────────────────

export async function generatePaperOutline(params: {
  paperId: string;
  shortId: string;
  language: string;
}): Promise<PaperOutline> {
  const { paperId, shortId, language } = params;
  const lang = language === 'zh' ? 'zh' : 'en';

  console.log('[generatePaperOutline] Starting outline generation for paper:', paperId);

  // Get paper info for PDF source
  const papersRepo = new PapersRepository();
  const paper = await papersRepo.findById(paperId);

  if (!paper) {
    console.error('[generatePaperOutline] Paper not found:', paperId);
    throw new Error('Paper not found in database.');
  }

  console.log('[generatePaperOutline] Paper found:', {
    title: paper.title,
    hasPdfUrl: !!paper.pdfUrl,
    hasPdfPath: !!paper.pdfPath,
  });

  const pdfUrl = paper?.pdfUrl ?? undefined;
  const pdfPath = paper?.pdfPath ?? undefined;

  // Get paper text (cached or extracted)
  console.log('[generatePaperOutline] Extracting paper text...');
  const paperText = await getPaperText(paperId, shortId, pdfUrl, pdfPath, {
    maxChars: 30000,
  });

  if (!paperText) {
    console.error('[generatePaperOutline] Failed to extract paper text');
    throw new Error('Could not extract paper text for outline generation.');
  }

  console.log('[generatePaperOutline] Paper text extracted:', paperText.length, 'characters');

  const systemPrompt = getPaperOutlinePrompt(lang);
  const userPrompt = `Paper text:\n\n${paperText}`;

  console.log('[generatePaperOutline] Calling AI model (chat)...');
  const response = await generateWithModelKind('chat', systemPrompt, userPrompt, {
    strictSelection: true,
  });

  console.log('[generatePaperOutline] AI response received:', response.substring(0, 200));

  const parsed = safeJsonParse<PaperOutline>(response);

  if (!parsed) {
    console.error('[generatePaperOutline] Failed to parse JSON response:', response);
    throw new Error('Failed to parse paper outline response as JSON.');
  }

  console.log('[generatePaperOutline] Successfully parsed outline');

  return {
    researchQuestions: Array.isArray(parsed.researchQuestions) ? parsed.researchQuestions : [],
    methodology: typeof parsed.methodology === 'string' ? parsed.methodology : '',
    keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
    limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
    contributions: Array.isArray(parsed.contributions) ? parsed.contributions : [],
  };
}

// ─── Reading Summary ────────────────────────────────────────────────────────

export async function generateReadingSummary(params: {
  paperId: string;
  highlights: Array<{ text: string; note?: string; color: string; page: number }>;
  language: string;
}): Promise<{ summary: string }> {
  const { highlights, language } = params;
  const lang = language === 'zh' ? 'zh' : 'en';

  if (highlights.length === 0) {
    throw new Error('No highlights provided for summary generation.');
  }

  const systemPrompt = getReadingSummaryPrompt(lang);

  // Format highlights into a readable list
  const formattedHighlights = highlights
    .map((h, i) => {
      let entry = `[${i + 1}] (Page ${h.page}, ${h.color}) "${h.text}"`;
      if (h.note) {
        entry += `\n   Note: ${h.note}`;
      }
      return entry;
    })
    .join('\n\n');

  const userPrompt = `Highlights from reading session:\n\n${formattedHighlights}`;

  const result = await generateWithModelKind('chat', systemPrompt, userPrompt, {
    strictSelection: true,
  });

  return { summary: result };
}

// ─── Page Text Extraction ───────────────────────────────────────────────────

export async function getPageText(params: {
  pdfPath: string;
  pageNumber: number;
}): Promise<{ text: string }> {
  const { pdfPath, pageNumber } = params;

  const buffer = await fs.readFile(pdfPath);

  const pdfParseModule = await import('pdf-parse');
  const PDFParse = resolvePdfParseConstructor(pdfParseModule);
  const parser = new PDFParse({ data: buffer });

  const textResult = await parser.getText();

  // Pages are 0-indexed in the result, but pageNumber is 1-indexed
  const pageIndex = pageNumber - 1;
  if (!textResult.pages || pageIndex < 0 || pageIndex >= textResult.pages.length) {
    return { text: '' };
  }

  return { text: textResult.pages[pageIndex].text };
}
