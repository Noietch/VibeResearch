/**
 * Background PDF reference extraction service.
 * Automatically extracts references from PDFs and saves to ExtractedReference table.
 * Runs after paper import without requiring the user to open the PDF.
 */
import { PapersRepository } from '@db';
import { parseReferencesFromText } from '@shared';
import { getPaperText } from './paper-text.service';

const queue: string[] = [];
const queuedIds = new Set<string>();
let running = false;

function shouldSkip(): boolean {
  return !!process.env.VITEST;
}

async function processPaper(paperId: string) {
  const repo = new PapersRepository();
  const paper = await repo.findById(paperId);
  if (!paper) return;

  // Only process papers with a LOCAL PDF file — don't trigger network downloads
  // This avoids rate limiting and "Failed to fetch" errors from arxiv/network
  if (!paper.pdfPath) return;

  // Check if already has extracted references
  const { getPrismaClient } = await import('@db');
  const prisma = getPrismaClient();
  const existingCount = await prisma.extractedReference.count({
    where: { paperId },
  });
  if (existingCount > 0) return;

  try {
    console.log(`[ref-extraction-bg] Extracting references from PDF for "${paper.title}"...`);

    // Get full text from PDF — force refresh to avoid using truncated cached text
    // (other services cache text.txt at 8000 chars which misses the reference section)
    const text = await getPaperText(
      paperId,
      paper.shortId,
      undefined, // Don't pass pdfUrl — only use local file
      paper.pdfPath ?? undefined,
      { maxChars: 200_000, forceRefresh: true },
    );

    if (!text || text.length < 100) {
      console.log(`[ref-extraction-bg] No text extracted for "${paper.title}", skipping`);
      return;
    }

    // Parse references from text
    const references = parseReferencesFromText(text);
    if (references.length === 0) {
      console.log(`[ref-extraction-bg] No references found in "${paper.title}"`);
      return;
    }

    console.log(
      `[ref-extraction-bg] Found ${references.length} references in "${paper.title}", saving...`,
    );

    // Save to database
    await prisma.extractedReference.deleteMany({ where: { paperId } });
    if (references.length > 0) {
      await prisma.extractedReference.createMany({
        data: references.map((ref) => ({
          paperId,
          refNumber: ref.number,
          text: ref.text,
          title: ref.title ?? null,
          authors: ref.authors ?? null,
          year: ref.year ?? null,
          doi: ref.doi ?? null,
          arxivId: ref.arxivId ?? null,
          venue: ref.venue ?? null,
          url: ref.url ?? null,
        })),
      });
    }

    console.log(`[ref-extraction-bg] Saved ${references.length} references for "${paper.title}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ref-extraction-bg] Failed for "${paper.title}": ${message}`);
  }
}

async function drainQueue() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const paperId = queue.shift();
      if (!paperId) continue;
      queuedIds.delete(paperId);
      await processPaper(paperId);
      // Small delay between papers to avoid overwhelming the system
      if (queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Schedule a paper for background reference extraction.
 * Called after paper import/download.
 */
export function scheduleReferenceExtraction(paperId: string) {
  if (shouldSkip()) return;
  if (queuedIds.has(paperId)) return;

  queuedIds.add(paperId);
  queue.push(paperId);
  void drainQueue();
}

/**
 * Resume reference extraction for papers that don't have extracted references yet.
 * Called at app startup.
 */
export async function resumeAutomaticReferenceExtraction() {
  if (shouldSkip()) return { queued: 0 };

  try {
    const { getPrismaClient } = await import('@db');
    const prisma = getPrismaClient();

    // Find papers with LOCAL PDFs only — don't trigger network downloads at startup
    const papers = await prisma.paper.findMany({
      where: {
        pdfPath: { not: null },
      },
      select: { id: true },
    });

    // Filter out papers that already have extracted references
    const papersWithRefs = await prisma.extractedReference.groupBy({
      by: ['paperId'],
    });
    const hasRefsSet = new Set(papersWithRefs.map((r: { paperId: string }) => r.paperId));

    let queued = 0;
    for (const paper of papers) {
      if (!hasRefsSet.has(paper.id)) {
        scheduleReferenceExtraction(paper.id);
        queued++;
      }
    }

    if (queued > 0) {
      console.log(`[ref-extraction-bg] Queued ${queued} papers for reference extraction`);
    }
    return { queued };
  } catch (err) {
    console.error(
      `[ref-extraction-bg] Failed to resume:`,
      err instanceof Error ? err.message : String(err),
    );
    return { queued: 0 };
  }
}
