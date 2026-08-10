import type { FileItemWithMatch } from "@/types";
import {
  SOURCE_CAPTURE_QUOTE_LIMIT,
  type NewSourceCapture,
} from "./sourceCapture";

/**
 * Longest excerpt a search result row paints. The capture keeps the full
 * verbatim quote (up to `SOURCE_CAPTURE_QUOTE_LIMIT`); this only caps the
 * display string so a 4,000-character PDF page hit does not ship into the
 * DOM of every card in the grid.
 */
const EXCERPT_LIMIT = 160;

export interface SearchSnippet {
  /** The capture a Knowledge action would add to the basket, verbatim. */
  capture: NewSourceCapture;
  /** Single-paragraph display text for the search result row. */
  excerpt: string;
}

interface Ranked {
  score: number;
  quote: string;
  capture: NewSourceCapture;
}

function sourceFields(file: FileItemWithMatch) {
  return {
    drive: file.drive,
    sourceFileId: file.id,
    filename: file.filename,
    fileType: file.file_type,
  };
}

function quotable(text: string | undefined): string | undefined {
  const quote = text?.trim();
  return quote ? quote.slice(0, SOURCE_CAPTURE_QUOTE_LIMIT) : undefined;
}

function excerptOf(quote: string): string {
  const flat = quote.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LIMIT
    ? `${flat.slice(0, EXCERPT_LIMIT).trimEnd()}…`
    : flat;
}

function isPdf(file: FileItemWithMatch): boolean {
  return (
    file.mime_type === "application/pdf" ||
    file.filename.toLowerCase().endsWith(".pdf")
  );
}

function isPlainText(file: FileItemWithMatch): boolean {
  const filename = file.filename.toLowerCase();
  return (
    file.mime_type === "text/markdown" ||
    file.mime_type === "text/plain" ||
    filename.endsWith(".md") ||
    filename.endsWith(".txt")
  );
}

/**
 * Pick the single strongest quotable piece of evidence behind a search hit.
 *
 * Only text-bearing evidence qualifies. A CLIP scene match carries no words,
 * so quoting it would produce a locator with an empty body — the timestamp
 * pills already give the user a way into that moment, and the file detail
 * page owns the richer per-row capture actions.
 */
export function buildSearchSnippet(
  file: FileItemWithMatch,
): SearchSnippet | null {
  const meta = file.match_meta;
  if (!meta) return null;

  const common = sourceFields(file);
  const ranked: Ranked[] = [];

  for (const match of meta.transcript ?? []) {
    const quote = quotable(match.text);
    const [seconds, endSeconds] = match.time_range;
    if (!quote || seconds < 0 || endSeconds < seconds) continue;
    ranked.push({
      score: match.score,
      quote,
      capture: {
        ...common,
        kind: "transcript",
        locator: { seconds, endSeconds },
        quote,
      },
    });
  }

  const pdf = isPdf(file);
  if (pdf || isPlainText(file)) {
    for (const match of meta.content_matches ?? []) {
      const quote = quotable(match.text);
      if (!quote) continue;
      // A PDF quote without a page cannot be linked back to its source.
      if (pdf && (!Number.isInteger(match.page) || (match.page ?? 0) < 1)) {
        continue;
      }
      ranked.push({
        score: match.score,
        quote,
        capture: {
          ...common,
          kind: "document_selection",
          ...(pdf ? { locator: { page: match.page! } } : {}),
          quote,
        },
      });
    }
  }

  const best = ranked.reduce<Ranked | null>(
    (top, item) => (top && top.score >= item.score ? top : item),
    null,
  );
  return best ? { capture: best.capture, excerpt: excerptOf(best.quote) } : null;
}
