import type { FileItem, FileItemWithMatch, FileKind, SortField, SortOrder } from "@/types";

import { mergeResults, sortMerged, type SemanticHit } from "./searchMerge";
import {
  comparisonWireForm,
  filterFromParsed,
  hasImpossibleRange,
  parseSearchQuery,
  resolveKinds,
  resolveModified,
} from "./searchQuery";

const PAGE_LIMIT = 500;
const SEMANTIC_LIMIT = 1000;

export interface SmartCollectionEvalInput {
  drive: string;
  query: string;
  type: FileKind | null;
  sort: SortField;
  order: SortOrder;
  includeSceneClip: boolean;
  /**
   * The zone absolute `modified:` dates are read in; the browser's own zone
   * when absent.
   */
  timeZone?: string | null;
  /**
   * The instant, in epoch milliseconds, relative amounts count back from.
   * One evaluation takes it once, so every page sends the same wire forms.
   */
  now?: number;
}

export interface SmartCollectionEvalIo {
  getDriveFiles: typeof import("./api").getDriveFiles;
  getSemanticAvailability: typeof import("./addons").getSemanticAvailability;
  fetchSemanticHits: typeof import("./semanticSearch").fetchSemanticHits;
}

export interface SmartCollectionEvalResult {
  files: FileItem[];
  complete: boolean;
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function withoutMatchMeta({
  match_meta: _meta,
  match_score: _score,
  ...file
}: FileItemWithMatch): FileItem {
  return file;
}

/**
 * The files a Smart Collection's search page lists in the Files view once
 * every page has loaded, or `complete: false` when part of that page's answer
 * could not be read.
 */
export async function evaluateSmartCollection(
  input: SmartCollectionEvalInput,
  io: SmartCollectionEvalIo,
): Promise<SmartCollectionEvalResult> {
  const parsed = parseSearchQuery(input.query.trim());
  const modified = resolveModified(
    parsed,
    input.now ?? Date.now(),
    input.timeZone ?? null,
  );
  const kinds = resolveKinds(input.type, parsed.types);
  if (kinds.impossible || hasImpossibleRange(parsed, modified.comparisons)) {
    return { files: [], complete: true };
  }

  // The filename-match backend doesn't understand "relevance"; `sortMerged`
  // reorders by hybrid score on the client. "random" is shuffled there too,
  // so its pages are read in a stable order.
  const ordered = input.sort === "relevance" || input.sort === "random";
  const listingSort: SortField = ordered ? "created_at" : input.sort;
  const listingOrder: SortOrder = ordered ? "desc" : input.order;

  const listed: FileItem[] = [];
  let listedTotal = 0;
  for (let page = 1; ; page += 1) {
    const res = await io.getDriveFiles(input.drive, {
      search: parsed.text,
      type:
        kinds.kinds.length === 0
          ? undefined
          : kinds.kinds.length === 1
            ? kinds.kinds[0]
            : kinds.kinds,
      tag: parsed.tags.length > 0 ? parsed.tags : undefined,
      favorite: parsed.favorite ? true : undefined,
      liked: parsed.liked ? true : undefined,
      folder: parsed.folders.length > 0 ? parsed.folders : undefined,
      collection: parsed.collections.length > 0 ? parsed.collections : undefined,
      ...(parsed.sizes.length > 0
        ? { size: parsed.sizes.map(comparisonWireForm) }
        : {}),
      ...(parsed.durations.length > 0
        ? { duration: parsed.durations.map(comparisonWireForm) }
        : {}),
      ...(modified.wireForms.length > 0 ? { modified: modified.wireForms } : {}),
      sort: listingSort,
      order: listingOrder,
      page,
      limit: PAGE_LIMIT,
    });
    listed.push(...res.data);
    listedTotal = res.meta.total;
    if (res.data.length < PAGE_LIMIT) break;
  }

  let complete = true;
  let semanticHits: SemanticHit[] = [];
  if (parsed.text !== "") {
    const availability = await io.getSemanticAvailability(input.drive);
    if (availability === "unknown") {
      complete = false;
    } else if (availability === "available") {
      const answer = await io.fetchSemanticHits(parsed.text, input.drive, {
        limit: SEMANTIC_LIMIT,
        passages: true,
        ...(parsed.hasOperators
          ? { filter: filterFromParsed(parsed, input.type, modified.wireForms) }
          : { type: input.type, includeSceneClip: input.includeSceneClip }),
      });
      if (answer.ok) {
        semanticHits = answer.results;
      } else if (answer.status !== 404) {
        // A 404 is the addon's search feature being off for this drive, which
        // leaves the listing exactly as the page shows it.
        complete = false;
      }
    }
  }

  const merged = mergeResults({
    filenameMatches: listed,
    semanticHits,
    filenameTotal: listedTotal,
    nameMatched: parsed.text !== "",
  });
  const sorted = sortMerged(merged.files, input.sort, input.order);
  const files = (input.sort === "random" ? shuffle(sorted) : sorted).map(withoutMatchMeta);
  return { files, complete };
}
