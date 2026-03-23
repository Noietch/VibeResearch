/**
 * Pure text-based reference parsing functions.
 * No dependencies on pdfjs, Node.js, or Electron - framework-agnostic.
 */

/**
 * Check if two titles are similar using word overlap.
 * Normalizes text and computes Jaccard similarity on word sets.
 * Returns true if similarity > 60%.
 */
export function isTitleSimilar(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const unionSize = new Set([...wordsA, ...wordsB]).size;
  return unionSize > 0 && intersection.length / unionSize > 0.6;
}

export interface Reference {
  number: number;
  text: string;
  title: string | null;
  authors: string | null;
  year: number | null;
  doi: string | null;
  arxivId: string | null;
  url: string | null;
  venue: string | null;
}

// Patterns to find reference section
const REFERENCE_SECTION_MARKERS = [
  'References',
  'REFERENCES',
  'Bibliography',
  'BIBLIOGRAPHY',
  'REFERENCES CITED',
  'LITERATURE CITED',
  'Reference',
  'REFERENCE',
  'References and Notes',
  'REFERENCES AND NOTES',
  'Citations',
  'CITATIONS',
  'Works Cited',
  'WORKS CITED',
];

// DOI pattern — allow dots inside DOI (e.g. 10.1109/ICSE-SEIP66354.2025.00038)
// Only stop at whitespace, brackets, quotes; strip trailing punctuation after match
const DOI_PATTERN = /10\.\d{4,}\/[^\s\])"<>]+/g;
// arXiv patterns
const ARXIV_NEW_PATTERN = /arXiv[:\s]*(\d{4}\.\d{4,5}(?:v\d+)?)/gi;
const ARXIV_OLD_PATTERN = /arXiv[:\s]*([a-z-]+\/\d+)/gi;
// Year pattern
const YEAR_PATTERN = /\b((?:19|20)\d{2})\b/g;

/**
 * Collapse spaced-out headers like "R E F E R E N C E S" → "REFERENCES"
 * Common in PDFs that use character spacing for styling.
 */
function collapseSpacedHeaders(text: string): string {
  // Match lines where single uppercase letters are separated by spaces
  // e.g. "R E F E R E N C E S" or "R EFERENCES" or "A PPENDIX"
  return text.replace(/\b([A-Z])\s+([A-Z])\s+([A-Z])\s+([A-Z](?:\s+[A-Z])*)\b/g, (match) =>
    match.replace(/\s+/g, ''),
  );
}

/**
 * Find the start of the reference section in text.
 * Returns the character index just after the section header, or -1 if not found.
 */
export function findReferenceSection(text: string): number {
  // First try on original text, then on collapsed text
  const result = findReferenceSectionInText(text);
  if (result !== -1) return result;

  // Try with collapsed spaced headers (handles "R EFERENCES" etc.)
  const collapsed = collapseSpacedHeaders(text);
  if (collapsed !== text) {
    const collapsedResult = findReferenceSectionInText(collapsed);
    if (collapsedResult !== -1) {
      // Map position back to original text — find nearest "R" in original
      // near the collapsed position
      const nearby = text.substring(Math.max(0, collapsedResult - 30), collapsedResult + 30);
      // Look for spaced-out reference header pattern near this position
      const spacedMatch = nearby.match(
        /R\s*E\s*F\s*E\s*R\s*E\s*N\s*C\s*E\s*S|B\s*I\s*B\s*L\s*I\s*O\s*G\s*R\s*A\s*P\s*H\s*Y/i,
      );
      if (spacedMatch && spacedMatch.index !== undefined) {
        const offset = Math.max(0, collapsedResult - 30);
        return offset + spacedMatch.index + spacedMatch[0].length;
      }
      return collapsedResult;
    }
  }

  return -1;
}

function findReferenceSectionInText(text: string): number {
  // Try to find section header - must be at start of line
  for (const marker of REFERENCE_SECTION_MARKERS) {
    // Try various formats of the header
    const patterns = [
      // \n References \n
      new RegExp(`\\n\\s*${marker}\\s*\\n`, 'i'),
      // \n References (end of line)
      new RegExp(`\\n\\s*${marker}\\s*$`, 'im'),
      // ^ References $ (line by itself)
      new RegExp(`^${marker}\\s*$`, 'im'),
      // \n References \n (no spaces)
      new RegExp(`\\n${marker}\\s*\\n`, 'i'),
      // References followed by colon or content
      new RegExp(`\\n\\s*${marker}[\\s:：]\\s*\\n`, 'i'),
      // PDF extraction: page number followed by References (pages joined by \n\n)
      new RegExp(`\\n\\n\\s*\\d+\\s*\\n\\n\\s*${marker}\\b`, 'i'),
      // PDF extraction: References preceded by period/sentence end and spaces (within same page text)
      new RegExp(`[.!?]\\s{2,}${marker}\\s`, 'i'),
      // PDF extraction: References word surrounded by spaces (common in space-joined PDF text)
      new RegExp(`\\s${marker}\\s+[A-Z][a-z]+,\\s+[A-Z]`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        // For patterns that match before the marker, find where the marker itself starts
        const markerIdx = match[0].toLowerCase().indexOf(marker.toLowerCase());
        return match.index + markerIdx + marker.length;
      }
    }
  }

  // Try a broader search: find "References" in the last 40% of the document
  // This handles cases where PDF text extraction merges the header with surrounding text
  const searchStart = Math.floor(text.length * 0.6);
  const searchText = text.slice(searchStart);
  for (const marker of REFERENCE_SECTION_MARKERS) {
    const idx = searchText.indexOf(marker);
    if (idx !== -1) {
      // Verify this is likely a section header by checking what follows
      const afterMarker = searchText.slice(idx + marker.length, idx + marker.length + 200);
      // Should be followed by author-like patterns or numbered references
      if (
        afterMarker.match(/^\s*\[?\s*1\s*\]?/) || // [1] or 1
        afterMarker.match(/^\s+[A-Z][a-z]+[\s,]/) || // Author name
        afterMarker.match(/^\s*\n/) // newline
      ) {
        return searchStart + idx + marker.length;
      }
    }
  }

  // Fallback: look for dense citation patterns at the end of document
  const lastQuarter = text.slice(Math.floor(text.length * 0.7));
  const lines = lastQuarter.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Check if line starts with [1] or 1. or (1) or 1)
    if (/^\[\s*1\s*\]|^\d+\.|^\(\s*1\s*\)|^\d+\)/.test(line)) {
      return text.length - lastQuarter.length + lines.slice(0, i).join('\n').length;
    }
  }

  // Fallback for space-joined PDF text: look for [1] within text (not at line start)
  const spaceJoinedMatch = lastQuarter.match(/\[\s*1\s*\]\s*[A-Z]/);
  if (spaceJoinedMatch && spaceJoinedMatch.index !== undefined) {
    return text.length - lastQuarter.length + spaceJoinedMatch.index;
  }

  // Try spaced-out headers directly: "R EFERENCES", "R E F E R E N C E S", etc.
  const spacedHeaderPattern = /(?:^|\n)\s*R\s+E\s*F\s*E\s*R\s*E\s*N\s*C\s*E\s*S\s*(?:\n|$)/im;
  const spacedMatch = text.match(spacedHeaderPattern);
  if (spacedMatch && spacedMatch.index !== undefined) {
    return spacedMatch.index + spacedMatch[0].length;
  }

  return -1;
}

/**
 * Parse reference list from plain text.
 * Finds the reference section, tries numbered references first,
 * falls back to author-year format, and returns sorted references.
 */
export function parseReferencesFromText(text: string): Reference[] {
  const references: Reference[] = [];
  const seenNumbers = new Set<number>();

  // Find reference section
  const refStart = findReferenceSection(text);
  if (refStart === -1) {
    return references;
  }

  let refSection = text.slice(refStart);

  // Trim at appendix/supplementary section if present
  // Handle both normal and spaced-out headers (e.g. "A PPENDIX", "A P P E N D I X")
  const appendixPatterns = [
    /\n\s*(?:Appendix|APPENDIX|Supplementary|SUPPLEMENTARY)\s*[\n:A-Z]/,
    /\n\s*A\s+P\s*P\s*E\s*N\s*D\s*I\s*X/i,
    /\n\s*S\s+U\s*P\s*P\s*L\s*E\s*M\s*E\s*N\s*T/i,
    // "A Complete Prompt Templates", "A.1 AST Generation", "B Detailed..." (appendix sections)
    /\n\s*[A-C]\s+[A-Z][a-z]+\s+[A-Z]/,
    /\n\s*[A-C]\.\d+\s+[A-Z]/,
  ];
  for (const pat of appendixPatterns) {
    const appendixMatch = refSection.match(pat);
    if (appendixMatch?.index && appendixMatch.index > 500) {
      refSection = refSection.slice(0, appendixMatch.index);
      break;
    }
  }

  // Strategy 1: Try numbered references with multi-line merging
  const numberedRefs = parseNumberedReferences(refSection);
  if (numberedRefs.length > 0) {
    for (const ref of numberedRefs) {
      if (!seenNumbers.has(ref.number)) {
        references.push(ref);
        seenNumbers.add(ref.number);
      }
    }
  }

  // Strategy 2: If numbered didn't work well, try author-year format
  if (references.length < 3) {
    const authorYearRefs = parseAuthorYearReferences(refSection);
    if (authorYearRefs.length > references.length) {
      // Author-year found more, use those instead
      references.length = 0;
      seenNumbers.clear();
      references.push(...authorYearRefs);
    }
  }

  // Sort by reference number
  references.sort((a, b) => a.number - b.number);

  return references;
}

/**
 * Parse author-year style references (no numbers).
 * Handles multi-line entries by splitting on year+period boundaries.
 * Reference entries typically end with a year followed by a period.
 */
function parseAuthorYearReferences(text: string): Reference[] {
  const references: Reference[] = [];

  // First, join all lines into a single string (references span multiple lines)
  const joined = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  // Split on boundaries between references.
  // A reference typically ends with a year followed by period/comma:
  // "..., 2020." or "..., 2020," or "...2020. "
  // The NEXT reference starts with "AuthorLastName, Initial"
  // Use lookahead to split: year+period followed by a new author name
  const entryPattern =
    /(?:,\s*|\s)(?:19|20)\d{2}[a-z]?\s*\.\s*(?=[A-Z][a-zA-Z\u00C0-\u024F'-]+,\s+[A-Z])/g;

  const entries: string[] = [];
  let lastEnd = 0;

  let m;
  while ((m = entryPattern.exec(joined)) !== null) {
    const entryEnd = m.index + m[0].length;
    const entry = joined.slice(lastEnd, entryEnd).trim();
    if (entry.length >= 30) {
      entries.push(entry);
    }
    lastEnd = entryEnd;
  }
  // Last entry
  const lastEntry = joined.slice(lastEnd).trim();
  if (lastEntry.length >= 30) {
    entries.push(lastEntry);
  }

  // Parse each entry
  let refNumber = 1;
  for (const entry of entries) {
    // Must contain a year to be a valid reference
    if (!entry.match(/\b(?:19|20)\d{2}\b/)) continue;

    const reference = createReference(entry, refNumber);

    // Extract authors (everything before the first period that's followed by a capital letter)
    const authorMatch = entry.match(
      /^((?:[A-Z][a-zA-Z\u00C0-\u024F'-]+,?\s+[A-Z][\w.]*(?:,?\s+)?)+(?:et\s+al\.?)?)/,
    );
    if (authorMatch) {
      reference.authors = authorMatch[1].replace(/\s+$/, '').replace(/,\s*$/, '');
    }

    references.push(reference);
    refNumber++;
  }

  return references;
}

/**
 * Parse numbered references with multi-line merging support.
 * Handles [N], N., (N), N) formats across both newline-separated and space-joined text.
 */
function parseNumberedReferences(text: string): Reference[] {
  // Pattern to detect numbered reference entry starts (anywhere in text)
  // Matches: [1] , 1. , (1) , 1)
  const entryStartPattern =
    /(?:^|\n)\s*\[(\d{1,3})\]\s|(?:^|\n)\s*(\d{1,3})\.\s+|(?:^|\n)\s*\((\d{1,3})\)\s|(?:^|\n)\s*(\d{1,3})\)\s+/g;

  // Find all entry start positions
  const entries: { number: number; start: number; matchEnd: number }[] = [];
  let m;

  while ((m = entryStartPattern.exec(text)) !== null) {
    const num = parseInt(m[1] || m[2] || m[3] || m[4], 10);
    if (isNaN(num) || num < 1 || num > 500) continue;
    entries.push({ number: num, start: m.index, matchEnd: m.index + m[0].length });
  }

  // Also try inline [N] pattern (matches [N] anywhere, not just at line start)
  // This handles both space-joined text and cases where newlines don't align with entry starts
  if (entries.length < 5) {
    const inlinePattern = /\[(\d{1,3})\]\s*(?=[A-Z])/g;
    const inlineEntries: { number: number; start: number; matchEnd: number }[] = [];
    while ((m = inlinePattern.exec(text)) !== null) {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= 500) {
        inlineEntries.push({ number: num, start: m.index, matchEnd: m.index + m[0].length });
      }
    }
    // Check if inline entries look sequential and found more than line-start pattern
    if (inlineEntries.length > entries.length && inlineEntries.length >= 3) {
      let seq = 0;
      for (let i = 1; i < inlineEntries.length; i++) {
        if (inlineEntries[i].number === inlineEntries[i - 1].number + 1) seq++;
      }
      if (seq / (inlineEntries.length - 1) >= 0.3) {
        entries.length = 0;
        entries.push(...inlineEntries);
      }
    }
  }

  if (entries.length === 0) return [];

  // Check if entries are roughly sequential (to confirm it's a reference list)
  if (entries.length > 2) {
    let sequential = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].number === entries[i - 1].number + 1) sequential++;
    }
    if (sequential / (entries.length - 1) < 0.3) return [];
  }

  // Extract text between markers
  const references: Reference[] = [];
  const seenNumbers = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (seenNumbers.has(entries[i].number)) continue;
    seenNumbers.add(entries[i].number);

    const textStart = entries[i].matchEnd;
    const textEnd = i + 1 < entries.length ? entries[i + 1].start : text.length;
    const refText = text.slice(textStart, textEnd).replace(/\s+/g, ' ').trim();

    if (refText.length < 20) continue;

    const reference = createReference(refText, entries[i].number);
    references.push(reference);
  }

  return references;
}

/**
 * Create a Reference object from text, extracting DOI, arXiv ID, year, title, and authors.
 */
/**
 * Strip trailing metadata that's not part of the reference.
 * e.g. "Received 2024-04-12; accepted 2024-07-03" at the end of ACM papers.
 */
function stripTrailingMetadata(text: string): string {
  return text
    .replace(/\s+Received\s+\d{4}-\d{2}-\d{2}.*$/i, '')
    .replace(/\s+Accepted\s+\d{4}-\d{2}-\d{2}.*$/i, '')
    .replace(/\s+Published\s+\d{4}-\d{2}-\d{2}.*$/i, '')
    .trim();
}

function createReference(refText: string, number: number): Reference {
  // Strip trailing metadata before parsing
  refText = stripTrailingMetadata(refText);
  // Rejoin words broken by PDF line-wrap hyphenation: "Chal- lenges" → "Challenges"
  refText = refText.replace(/([a-zA-Z])-\s+([a-z])/g, '$1$2');
  const reference: Reference = {
    number,
    text: refText,
    title: null,
    authors: null,
    year: null,
    doi: null,
    arxivId: null,
    url: null,
    venue: null,
  };

  // Repair URLs broken by PDF line-wrapping then extract
  // Handle "https:\n//" → "https: //" (space between scheme and //)
  let repairedText = refText.replace(/https?\s*:\s*\/\//g, (m) => {
    // Collapse "https: //" or "https : //" back to "https://"
    return m.replace(/\s+/g, '');
  });
  // e.g. "https://developer.huawei.com/ consumer/cn/doc/foo" → joined
  repairedText = repairedText.replace(
    /https?:\/\/\S+(?:\s+[a-zA-Z0-9/_\-.~%:?#&=]+)*/g,
    (match) => {
      const parts = match.split(/\s+/);
      if (parts.length <= 1) return match;
      let url = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const frag = parts[i];
        // Stop joining if fragment looks like a normal English word (no URL chars)
        if (/^[a-zA-Z]{5,}$/.test(frag) && !/[/.\-_~%:?#&=]/.test(frag)) break;
        // Stop joining if fragment looks like metadata (e.g. "accessed:", "retrieved:")
        if (/^(?:accessed|retrieved|visited|available|online)[:.]?$/i.test(frag)) break;
        // Stop joining if fragment is a standalone year or date-like token
        if (/^\d{4}[.,;]?$/.test(frag)) break;
        url += frag;
      }
      return url + match.slice(url.length);
    },
  );
  const urlMatch = repairedText.match(/https?:\/\/\S+/);
  if (urlMatch) {
    // Strip trailing punctuation and also common suffixes like ",accessed:..."
    let cleanUrl = urlMatch[0].replace(/[.,;)\]]+$/, '');
    // Remove trailing ",accessed..." or ",retrieved..." that got glued to the URL
    cleanUrl = cleanUrl.replace(/,(?:accessed|retrieved|visited).*$/i, '');
    reference.url = cleanUrl;
  }

  // Extract DOI
  DOI_PATTERN.lastIndex = 0;
  const doiMatch = refText.match(DOI_PATTERN);
  if (doiMatch) {
    reference.doi = doiMatch[0].replace(/[.,;)\]]+$/, '');
  }

  // Extract arXiv ID (new format)
  // Use non-global patterns for exec() to get capture groups correctly
  const arxivNewLocal = /arXiv[:\s]*(\d{4}\.\d{4,5}(?:v\d+)?)/i;
  const arxivMatch = refText.match(arxivNewLocal);
  if (arxivMatch) {
    reference.arxivId = arxivMatch[1];
  } else {
    // Try old format
    const arxivOldLocal = /arXiv[:\s]*([a-z-]+\/\d+)/i;
    const arxivOldMatch = refText.match(arxivOldLocal);
    if (arxivOldMatch) {
      reference.arxivId = arxivOldMatch[1];
    }
  }

  // Extract year (look for 4-digit years starting with 19 or 20)
  // Prefer the first standalone year (not inside URLs, DOIs, or arXiv IDs)
  // Strip URLs and DOIs before searching to avoid false matches
  const textForYear = refText
    .replace(/https?:\/\/\S+/g, '')
    .replace(/10\.\d{4,}\/\S+/g, '')
    .replace(/arXiv[:\s]*\d{4}\.\d{4,5}(?:v\d+)?/gi, '');
  YEAR_PATTERN.lastIndex = 0;
  const yearMatches = textForYear.matchAll(YEAR_PATTERN);
  const years = Array.from(yearMatches, (m) => parseInt(m[1], 10)).filter(
    (y) => y >= 1950 && y <= new Date().getFullYear() + 1,
  );
  if (years.length > 0) {
    // Take the first year found (usually the publication year in author block)
    reference.year = years[0];
  }

  // Extract title - look for text in quotes (various quote styles from PDF extraction)
  // Covers: "title", \u201Ctitle\u201D, \u2018title\u2019, ``title'', "title",
  // plus additional PDF quote variants: \u00AB\u00BB (guillemets), \u201E\u201C (German), etc.
  const titleMatch = refText.match(
    /[\u201C\u201E\u00AB"]\s*([^"\u201D\u00BB]+?)\s*[\u201D\u00BB"]|[\u2018']\s*([^'\u2019]+?)\s*[\u2019']|``\s*([^'`]+?)\s*''|"\s*([^"]+?)\s*"|[\u0022]\s*([^\u0022]+?)\s*[\u0022]/,
  );
  if (titleMatch) {
    const rawTitle = (
      titleMatch[1] ||
      titleMatch[2] ||
      titleMatch[3] ||
      titleMatch[4] ||
      titleMatch[5] ||
      ''
    ).trim();
    let title = rawTitle.replace(/[,;]\s*$/, '');

    // For short quoted titles (e.g., "Wala,"), check if followed by a URL — merge into title
    // This handles tool/website references like: "Wala," https://github.com/..., accessed: ...
    if (title.length < 15) {
      const afterQuote = refText.slice((titleMatch.index ?? 0) + titleMatch[0].length).trim();
      const urlMatch = afterQuote.match(/^,?\s*(https?:\/\/\S+)/);
      if (urlMatch) {
        const url = urlMatch[1].replace(/[.,;)\]]+$/, '');
        title = `${title} (${url})`;
      }
    }

    reference.title = title;
  } else {
    // No quoted title — infer title from structure
    // Strategy 1: Look for comma-separated author list followed by period + title
    // IEEE style: "A. Last, B. Last, and C. Last. Title here. In ..."
    // ACM style: "Last, A., Last, B. Title here. In ..."
    //
    // The key insight: author blocks have short segments separated by commas/periods
    // (initials, last names), while titles are longer continuous phrases.
    //
    // Find the boundary: a ". " followed by a word with 2+ lowercase letters,
    // but NOT after a single uppercase letter (initial) and not after common abbreviations.
    const ABBREVS =
      /(?:et\s+al|pp|vol|no|ed|eds|Dr|Mr|Mrs|Ms|St|Jr|Sr|vs|Inc|Ltd|Corp|Dept|Univ|Conf|Trans|Proc|Rev|Int|Natl|Assoc)\s*$/i;

    let titleStart = -1;
    // Walk through ". " boundaries
    const dotSpacePattern = /\.\s+/g;
    let dotMatch;
    while ((dotMatch = dotSpacePattern.exec(refText)) !== null) {
      const before = refText.slice(0, dotMatch.index);
      const after = refText.slice(dotMatch.index + dotMatch[0].length);

      // "et al." is special: what follows is typically the title
      if (/et\s+al\s*$/.test(before)) {
        if (/^[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]{2,}|^[a-z]{2,}/.test(after)) {
          titleStart = dotMatch.index + dotMatch[0].length;
          break;
        }
        continue;
      }
      // Skip other common abbreviations
      if (ABBREVS.test(before)) continue;

      // Check if after starts with something that looks like a title
      // - Multi-letter word starting with capital: "Syntax-guided..."
      // - Lowercase word: "understanding..."
      // - Single capital letter followed by space + lowercase word: "A syntax-guided..."
      // - Quote character followed by a capital letter: "\"Title..." or "\u201CTitle..."
      const looksLikeTitle =
        /^[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]{2,}|^[a-z]{2,}/.test(after) ||
        /^[A-Z]\s+[a-z]/.test(after) ||
        /^["\u201C\u201E\u00AB\u0022]\s*[A-Z]/.test(after);
      if (!looksLikeTitle) continue;

      // If before ends with a 4-digit year, this is ACM "Year. Title" boundary — accept it
      if (/\d{4}$/.test(before.trim())) {
        titleStart = dotMatch.index + dotMatch[0].length;
        break;
      }

      // Skip if before ends with a single letter (author initial like "A." or "Y.")
      // UNLESS what follows has multiple words (strong indicator of a title)
      if (/[A-Z\u00C0-\u024F]$/.test(before)) {
        const lastWord = before.split(/[\s,]+/).pop() ?? '';
        if (lastWord.length <= 2) {
          // Check if after has multiple words before next period — likely a title
          const firstSentence = after.split(/\.\s/)[0];
          const wordCount = firstSentence.trim().split(/\s+/).length;
          if (wordCount < 3) continue; // Too short, probably still in author block
        }
      }

      titleStart = dotMatch.index + dotMatch[0].length;
      break;
    }

    if (titleStart > 5) {
      const afterAuthors = refText.slice(titleStart);
      // Extract title: up to venue/journal markers
      const venuePattern =
        /[,.]?\s+[Ii]n\s+(?:Proceedings|Proc\b|\d{4}\s|ESEC|ICSE|ASE|ISSTA|FSE|PLDI|POPL|OOPSLA|SOSP|OSDI|NDSS|CCS|USENIX|NeurIPS|ICML|ICLR|AAAI|IJCAI|CVPR|ICCV|ECCV|ACL|EMNLP|NAACL|CHI|WWW|KDD|SIGMOD|VLDB)|[,.]\s+(?:Advances\s+|Proceedings\s+|arXiv\s|(?:pp|vol|no)\.\s|\d{4})|\.?\s+(?:arXiv\s+preprint|IEEE\s|ACM\s|Springer\s|Elsevier\s|Nature\s|Science\s|Journal\s|Trans(?:actions)?\.\s|ESEC\/)/;
      const venueMatch = afterAuthors.match(venuePattern);
      const possibleTitle = venueMatch
        ? afterAuthors.slice(0, venueMatch.index).trim()
        : afterAuthors.split(/\.\s+/)[0].trim();

      if (possibleTitle.length > 10 && possibleTitle.length < 300 && !possibleTitle.match(/^\d/)) {
        reference.title = possibleTitle.replace(/[,;.]\s*$/, '');
      }
    }

    // Fallback: handle ACM format "Author. YEAR. Title. In Venue."
    // where a 4-digit year appears as its own segment
    if (!reference.title) {
      const parts = refText.split(/\.\s+/);
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        // Skip year-only segments (ACM format puts year before title)
        if (/^\d{4}[a-z]?$/.test(part)) continue;
        if (part.length > 10 && part.length < 300 && !part.match(/^\d/) && part.includes(' ')) {
          // Skip venue/source fragments
          if (/^arXiv\s|^[Ii]n\s+Proceedings|^[Ii]n\s+Proc\b/.test(part)) continue;
          reference.title = part.replace(/[,;.]\s*$/, '');
          break;
        }
      }
    }
  }

  // Post-process title: strip venue/journal markers that got included
  if (reference.title) {
    // Strip trailing quote + venue: '?" In:...' or '" In ...' or '." In ...'
    reference.title = reference.title
      .replace(/["\u201D\u00BB]?\s*[Ii]n\s*:\s*.*$/, '')
      .replace(
        /["\u201D\u00BB]?\s*[Ii]n\s+(?:Proceedings|Proc\b|Advances\b|ESEC|ICSE|ASE|ISSTA|NeurIPS|ICML|ICLR|AAAI|IJCAI|CVPR|ICCV|ECCV|ACL|EMNLP|IEEE|ACM|Springer|arXiv).*$/i,
        '',
      )
      .replace(/\s*,?\s*arXiv\s+preprint\s+arXiv[:\s]*\d{4}\.\d{4,5}.*$/i, '')
      .replace(/["\u201C\u201D\u201E\u00AB\u00BB\u0022]+/g, '') // Strip remaining quote chars
      .replace(/[,;.]\s*$/, '')
      .trim();
    // If title became too short after stripping, null it out
    if (reference.title.length < 5) {
      reference.title = null;
    }
  }

  // Extract authors from the beginning of the reference text (everything before title)
  if (!reference.authors && reference.title) {
    // Find the title (or its opening quote) in the original text
    let titleIdx = -1;

    // Try to find the quoted title position (including the opening quote)
    const quotePatterns = [
      `\u201C${reference.title}`,
      `"${reference.title}`,
      `\u2018${reference.title}`,
      `'${reference.title}`,
      `\`\`${reference.title}`,
      `"${reference.title}`,
      reference.title,
    ];
    for (const pattern of quotePatterns) {
      const idx = refText.indexOf(pattern);
      if (idx > 3) {
        titleIdx = idx;
        break;
      }
    }

    if (titleIdx > 3) {
      let authorStr = refText.slice(0, titleIdx).trim();
      // Clean trailing punctuation: commas, periods, quotes, dashes
      authorStr = authorStr.replace(/[\s,."'\u201C\u201D\u2018\u2019`-]+$/, '').trim();
      if (authorStr.length > 2) {
        reference.authors = authorStr;
      }
    }
  }

  // Extract venue: text between title and year, typically after "In " or ". "
  if (reference.title && !reference.venue) {
    const titleEnd = refText.indexOf(reference.title) + reference.title.length;
    if (titleEnd > 0 && titleEnd < refText.length) {
      const afterTitle = refText.slice(titleEnd).trim();
      // Common venue patterns:
      // ". In Proceedings of NeurIPS, 2020."
      // ". Nature, 533(7604), 2016."
      // ". arXiv preprint arXiv:2301.12345, 2023."
      // ". In ICML, pp. 1234-1240, 2021."
      const venueMatch = afterTitle.match(
        /^[.,]?\s*(?:In\s+)?(.+?)(?:,\s*(?:pp\.|pages|vol\.|volume)|\s*,\s*\d{4}|\s*\.\s*$)/i,
      );
      if (venueMatch) {
        let venue = venueMatch[1]
          .replace(/^[.,]\s*/, '')
          .replace(/\s*[.,]\s*$/, '')
          .trim();
        // Skip if it's just "arXiv preprint" or very short
        if (venue.length > 3 && venue.length < 200) {
          reference.venue = venue;
        }
      }
    }
  }

  return reference;
}

/**
 * Clean a citation/reference string for use as a search query.
 * Strips author prefixes, venue info, arXiv IDs, year suffixes,
 * and other metadata that would pollute a title search.
 */
export function cleanCitationSearchQuery(query: string): string {
  let cleaned = query.replace(/\s+/g, ' ').trim();

  // Strip leading [N] reference numbers
  cleaned = cleaned.replace(/^\[\d+\]\s*/, '');

  // Strip author prefix: "Author et al." or "A. Author, B. Author."
  // Look for "et al." and take everything after it
  const etAlMatch = cleaned.match(/\bet\s+al\.?\s*[,.]?\s*(.*)/i);
  if (etAlMatch && etAlMatch[1].length > 10) {
    cleaned = etAlMatch[1];
  }

  // Strip surrounding quote characters
  cleaned = cleaned
    .replace(/^["\u201C\u201E\u00AB\u0022]+/, '')
    .replace(/["\u201D\u00BB\u0022]+$/, '');

  // Strip trailing venue markers: "In: ...", "In Proceedings...", "arXiv preprint..."
  cleaned = cleaned
    .replace(/["\u201D\u00BB]?\s*[Ii]n\s*:\s*.*$/, '')
    .replace(/["\u201D\u00BB]?\s*[Ii]n\s+(?:Proceedings|Proc\b|Advances\b).*$/i, '')
    .replace(/\s*,?\s*arXiv\s+preprint\s+arXiv[:\s]*\d{4}\.\d{4,5}.*$/i, '')
    .replace(
      /[.,]\s*(?:IEEE|ACM|Springer|Elsevier|Trans\.|Transactions|Journal|Conference|Workshop|Symposium)\b.*/i,
      '',
    )
    .replace(/\s*\d+\s*,\s*\d+\s*\(\d{4}\).*$/, '') // "47, 9 (2019)"
    .replace(/\s*\(\d{4}\)\s*\.?\s*$/, '') // "(2019)."
    .replace(/\s*,\s*\d{4}\s*\.?\s*$/, ''); // ", 2019."

  // Strip remaining quote chars and trailing punctuation
  cleaned = cleaned
    .replace(/["\u201C\u201D\u201E\u00AB\u00BB\u0022]+/g, '')
    .replace(/[,;.]+\s*$/, '')
    .trim();

  return cleaned;
}
