import { generateWithModelKind, getSelectedModelInfo } from './ai-provider.service';

export interface ExtractedMetadata {
  title?: string;
  authors?: string[];
  abstract?: string;
  submittedAt?: Date | null;
}

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

export async function extractPaperMetadata(text: string): Promise<ExtractedMetadata> {
  const lightweight = getSelectedModelInfo('lightweight');
  if (!lightweight) {
    throw new Error('No lightweight model configured.');
  }

  const systemPrompt = [
    'Extract metadata from academic paper text.',
    'Return strict JSON only.',
    'Use exactly these keys: title, authors, abstract, submittedAt.',
    'authors must be an array of strings.',
    'submittedAt must be an ISO date string or null.',
    'If a field cannot be determined, use null or an empty array.',
    'IMPORTANT: Extract the COMPLETE abstract — do not truncate or summarize it.',
    'The abstract may span multiple paragraphs.',
    'If the text has characters separated by spaces (e.g. "T h i s"), collapse them into normal words.',
    'Clean up any PDF extraction artifacts in the output (broken words, extra spaces, license headers).',
  ].join(' ');

  const userPrompt = ['Paper text:', text.slice(0, 18000)].join('\n\n');

  const response = await generateWithModelKind('lightweight', systemPrompt, userPrompt, {
    strictSelection: true,
  });

  const payload = safeJsonParse<{
    title?: string | null;
    authors?: string[] | null;
    abstract?: string | null;
    submittedAt?: string | null;
  }>(response);

  return {
    title: cleanExtractedTitle(payload?.title?.trim() || undefined),
    authors: Array.isArray(payload?.authors)
      ? payload.authors.map((author) => author.trim()).filter(Boolean)
      : undefined,
    abstract: payload?.abstract?.trim() || undefined,
    submittedAt: payload?.submittedAt ? new Date(payload.submittedAt) : undefined,
  };
}

/**
 * Clean extracted title by removing journal/venue prefixes that the LLM sometimes includes.
 * e.g. "SCIENCE CHINA Information Sciences . RESEARCH PAPER . Effective Fine-tuning..."
 * → "Effective Fine-tuning..."
 */
function cleanExtractedTitle(title?: string): string | undefined {
  if (!title) return undefined;

  // Remove leading journal/venue prefixes followed by separator patterns
  // Matches: "JOURNAL NAME . PAPER TYPE . Actual Title"
  const prefixPattern =
    /^(?:SCIENCE\s+CHINA\s+\w+(?:\s+\w+)*|IEEE\s+\w+(?:\s+\w+)*|ACM\s+\w+(?:\s+\w+)*|Springer\s+\w+(?:\s+\w+)*|Nature\s+\w*|Proceedings\s+of\s+\w+(?:\s+\w+)*)\s*[.\-·]\s*/i;
  let cleaned = title.replace(prefixPattern, '');

  // Remove paper type labels: "RESEARCH PAPER .", "ORIGINAL ARTICLE .", etc.
  cleaned = cleaned.replace(
    /^(?:RESEARCH\s+PAPER|ORIGINAL\s+ARTICLE|FULL\s+PAPER|SHORT\s+PAPER|SURVEY|REVIEW\s+ARTICLE)\s*[.\-·]\s*/i,
    '',
  );

  return cleaned.trim() || title;
}
