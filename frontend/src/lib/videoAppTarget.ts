import type { ShelvesParams } from "@/lib/api";
import { comparisonWireForm, parseSearchQuery, resolveKinds } from "@/lib/searchQuery";
import type { SmartFolder } from "@/types/smartFolder";

/** The conditions a target adds to every request of the app. */
export type VideoTargetParams = Pick<
  ShelvesParams,
  "search" | "favorite" | "liked" | "tag" | "type" | "folder" | "collection" | "size" | "duration"
> & { type: ["video"] };

export type VideoTarget =
  | { usable: true; params: VideoTargetParams }
  /** The kinds do not meet video, so nothing can match and nothing is requested. */
  | { usable: true; empty: true; params: null }
  /** A query part with no listing parameter; the menu lists the folder disabled. */
  | { usable: false; reason: "unsupported_part" };

const VIDEO_ONLY: ["video"] = ["video"];

/**
 * `null` is the app's default target, every video of the drive. A smart
 * folder's own sort is not carried: the app owns the order.
 */
export function resolveVideoTarget(folder: SmartFolder | null): VideoTarget {
  if (folder === null) return { usable: true, params: { type: VIDEO_ONLY } };

  const parsed = parseSearchQuery(folder.query);
  const { kinds, impossible } = resolveKinds(folder.file_type, parsed.types);
  // No kind named at all leaves the base kind; `impossible` is the folder's own kinds contradicting.
  if (impossible || (kinds.length > 0 && !kinds.includes("video"))) {
    return { usable: true, empty: true, params: null };
  }

  const params: VideoTargetParams = { type: VIDEO_ONLY };
  if (parsed.text) params.search = parsed.text;
  if (parsed.tags.length > 0) params.tag = parsed.tags;
  if (parsed.folders.length > 0) params.folder = parsed.folders;
  if (parsed.collections.length > 0) params.collection = parsed.collections;
  if (parsed.favorite) params.favorite = true;
  if (parsed.liked) params.liked = true;
  if (parsed.sizes.length > 0) params.size = parsed.sizes.map(comparisonWireForm);
  if (parsed.durations.length > 0) params.duration = parsed.durations.map(comparisonWireForm);
  return { usable: true, params };
}
