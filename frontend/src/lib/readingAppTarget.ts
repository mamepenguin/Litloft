import type { ShelvesParams } from "@/lib/api";
import {
  comparisonWireForm,
  kindHolds,
  parseSearchQuery,
  resolveKinds,
} from "@/lib/searchQuery";
import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

export const READING_BASE_KINDS = ["pdf", "epub", "archive"] as const;

/** The conditions a target adds to every request of the app. */
export type ReadingTargetParams = Pick<
  ShelvesParams,
  "search" | "favorite" | "liked" | "tag" | "type" | "folder" | "collection" | "size"
> & { type: FileKind[] };

export type ReadingTarget =
  | { usable: true; params: ReadingTargetParams }
  /** The kinds do not meet the app's, so nothing can match and nothing is requested. */
  | { usable: true; empty: true; params: null }
  /** A query part with no listing parameter; the menu lists the folder disabled. */
  | { usable: false; reason: "unsupported_part" };

const OPERATOR_NAMES = "tag|type|path|in|size|duration|is";
const NEGATED_OPERATOR = new RegExp(
  `(?:^|\\s)[-!](?:${OPERATOR_NAMES})\\s*[:：]`,
  "i",
);

/**
 * The listing has no negation. A token written as one is therefore a part the
 * app cannot hand to the endpoint, and the target must not be offered.
 */
function hasNegatedOperator(query: string): boolean {
  return NEGATED_OPERATOR.test(query);
}

function intersect(base: readonly FileKind[], target: readonly FileKind[]): FileKind[] {
  return base.filter((kind) =>
    target.some((named) => named === kind || kindHolds(named, kind)),
  );
}

/**
 * `null` is the app's default target, every book of the drive. A smart
 * folder's own sort is not carried: the app owns the order.
 */
export function resolveReadingTarget(folder: SmartFolder | null): ReadingTarget {
  if (folder === null) {
    return { usable: true, params: { type: [...READING_BASE_KINDS] } };
  }

  if (hasNegatedOperator(folder.query)) {
    return { usable: false, reason: "unsupported_part" };
  }

  const parsed = parseSearchQuery(folder.query);
  if (parsed.durations.length > 0) {
    return { usable: false, reason: "unsupported_part" };
  }

  const { kinds, impossible } = resolveKinds(folder.file_type, parsed.types);
  // No kind named at all leaves the base kinds; a folder whose own kind
  // contradicts its query has no books either.
  if (impossible) return { usable: true, empty: true, params: null };

  const types = kinds.length === 0 ? [...READING_BASE_KINDS] : intersect(READING_BASE_KINDS, kinds);
  if (types.length === 0) return { usable: true, empty: true, params: null };

  const params: ReadingTargetParams = { type: types };
  if (parsed.text) params.search = parsed.text;
  if (parsed.tags.length > 0) params.tag = parsed.tags;
  if (parsed.folders.length > 0) params.folder = parsed.folders;
  if (parsed.collections.length > 0) params.collection = parsed.collections;
  if (parsed.favorite) params.favorite = true;
  if (parsed.liked) params.liked = true;
  if (parsed.sizes.length > 0) params.size = parsed.sizes.map(comparisonWireForm);
  return { usable: true, params };
}
