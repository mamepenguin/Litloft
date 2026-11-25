import type { ShelvesParams } from "@/lib/api";
import { resolveCollectionTarget } from "@/lib/appTarget";
import { resolveMemberTarget, type MemberTarget } from "@/lib/memberTarget";
import {
  comparisonWireForm,
  hasImpossibleConditions,
  kindHolds,
  parseSearchQuery,
  resolveKinds,
} from "@/lib/searchQuery";
import type { CollectionSummary } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

/** The conditions a target adds to every request of the app. */
export type VideoTargetParams = Pick<
  ShelvesParams,
  | "search"
  | "favorite"
  | "liked"
  | "tag"
  | "type"
  | "folder"
  | "collection"
  | "size"
  | "duration"
  | "exclude_tag"
  | "exclude_type"
  | "exclude_folder"
  | "exclude_collection"
  | "has_tag"
  | "has_collection"
> & { type: ["video"] };

export type VideoTarget =
  | { usable: true; params: VideoTargetParams }
  /** Nothing can match, so nothing is requested. */
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
  if ((parsed.modified?.length ?? 0) > 0) {
    return { usable: false, reason: "unsupported_part" };
  }
  if (hasImpossibleConditions(parsed)) {
    return { usable: true, empty: true, params: null };
  }
  const { kinds, impossible } = resolveKinds(folder.file_type, parsed.types);
  const excluded = parsed.excludedTypes.some((kind) => kindHolds(kind, "video"));
  // No kind named at all leaves the base kind; `impossible` is the folder's own kinds contradicting.
  if (impossible || (kinds.length > 0 && !kinds.includes("video")) || excluded) {
    return { usable: true, empty: true, params: null };
  }

  const params: VideoTargetParams = { type: VIDEO_ONLY };
  if (parsed.text) params.search = parsed.text;
  if (parsed.tags.length > 0) params.tag = parsed.tags;
  if (parsed.folders.length > 0) params.folder = parsed.folders;
  if (parsed.collections.length > 0) params.collection = parsed.collections;
  if (parsed.favorite) params.favorite = true;
  if (parsed.notFavorite) params.favorite = false;
  if (parsed.liked) params.liked = true;
  if (parsed.notLiked) params.liked = false;
  if (parsed.sizes.length > 0) params.size = parsed.sizes.map(comparisonWireForm);
  if (parsed.durations.length > 0) params.duration = parsed.durations.map(comparisonWireForm);
  if (parsed.excludedTags.length > 0) params.exclude_tag = parsed.excludedTags;
  if (parsed.excludedTypes.length > 0) params.exclude_type = parsed.excludedTypes;
  if (parsed.excludedFolders.length > 0) params.exclude_folder = parsed.excludedFolders;
  if (parsed.excludedCollections.length > 0) {
    params.exclude_collection = parsed.excludedCollections;
  }
  if (parsed.hasTag || parsed.noTag) params.has_tag = parsed.hasTag;
  if (parsed.hasCollection || parsed.noCollection) {
    params.has_collection = parsed.hasCollection;
  }
  return { usable: true, params };
}

/** The Smart Collection a target sends members for; `null` when it resolves to listing parameters. */
export function resolveVideoMemberTarget(folder: SmartFolder | null): MemberTarget | null {
  return resolveMemberTarget(folder, VIDEO_ONLY, { directDuration: true });
}

/** A collection's videos, in Video's own params type. */
export function resolveVideoCollectionTarget(collection: CollectionSummary): VideoTarget {
  const { params } = resolveCollectionTarget(collection, VIDEO_ONLY);
  return { usable: true, params: { type: VIDEO_ONLY, collection: params.collection } };
}

/** The kinds a member target's requests carry; `null` when its kinds meet no video. */
export function videoMemberParams(target: MemberTarget): VideoTargetParams | null {
  return target.kinds.length === 0 ? null : { type: VIDEO_ONLY };
}
