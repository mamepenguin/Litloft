import type { ShelvesParams } from "@/lib/api";
import {
  comparisonWireForm,
  hasImpossibleConditions,
  kindHolds,
  parseSearchQuery,
  resolveKinds,
} from "@/lib/searchQuery";
import type { CollectionSummary, FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

/** The conditions a target adds to every request of the app. */
export type AppTargetParams = Pick<
  ShelvesParams,
  | "search"
  | "favorite"
  | "liked"
  | "tag"
  | "type"
  | "folder"
  | "collection"
  | "size"
  | "exclude_tag"
  | "exclude_type"
  | "exclude_folder"
  | "exclude_collection"
  | "has_tag"
  | "has_collection"
> & { type: FileKind[] };

export type AppTarget =
  | { usable: true; params: AppTargetParams }
  /** Nothing can match, so nothing is requested. */
  | { usable: true; empty: true; params: null }
  /** A query part with no listing parameter; the menu lists the folder disabled. */
  | { usable: false; reason: "unsupported_part" };

/** Which kind of target a saved id names. */
export type AppTargetId =
  | { kind: "default" }
  | { kind: "smart"; id: string }
  | { kind: "collection"; id: string };

const COLLECTION_PREFIX = "collection:";

/**
 * A bare id means a Smart Collection: every id saved before collections could
 * be a target keeps its meaning, and no id contains the prefix.
 */
export function parseAppTargetId(id: string): AppTargetId {
  if (id === "default") return { kind: "default" };
  if (id.startsWith(COLLECTION_PREFIX)) {
    return { kind: "collection", id: id.slice(COLLECTION_PREFIX.length) };
  }
  return { kind: "smart", id };
}

export function collectionTargetId(collectionId: string): string {
  return `${COLLECTION_PREFIX}${collectionId}`;
}

function intersect(base: readonly FileKind[], target: readonly FileKind[]): FileKind[] {
  return base.filter((kind) =>
    target.some((named) => named === kind || kindHolds(named, kind)),
  );
}

/**
 * A base list with `document` or without any kind would silently widen or empty
 * every target, so it is refused rather than resolved.
 */
function assertBaseKinds(baseKinds: readonly FileKind[]): void {
  if (baseKinds.length === 0 || baseKinds.includes("document")) {
    throw new Error("baseKinds must be non-empty and hold no parent kind");
  }
}

/**
 * `null` is the app's default target, every file of the base kinds. A smart
 * folder's own sort is not carried: the app owns the order.
 */
export function resolveAppTarget(
  folder: SmartFolder | null,
  baseKinds: readonly FileKind[],
): AppTarget {
  assertBaseKinds(baseKinds);

  if (folder === null) {
    return { usable: true, params: { type: [...baseKinds] } };
  }

  const parsed = parseSearchQuery(folder.query);
  if (parsed.durations.length > 0 || (parsed.modified?.length ?? 0) > 0) {
    return { usable: false, reason: "unsupported_part" };
  }
  if (hasImpossibleConditions(parsed, folder.file_type)) {
    return { usable: true, empty: true, params: null };
  }

  const { kinds, impossible } = resolveKinds(folder.file_type, parsed.types);
  // No kind named at all leaves the base kinds; a folder whose own kind
  // contradicts its query has no file of them either.
  if (impossible) return { usable: true, empty: true, params: null };

  const types = (kinds.length === 0 ? [...baseKinds] : intersect(baseKinds, kinds)).filter(
    (kind) => !parsed.excludedTypes.some((excluded) => kindHolds(excluded, kind)),
  );
  if (types.length === 0) return { usable: true, empty: true, params: null };

  const params: AppTargetParams = { type: types };
  if (parsed.text) params.search = parsed.text;
  if (parsed.tags.length > 0) params.tag = parsed.tags;
  if (parsed.folders.length > 0) params.folder = parsed.folders;
  if (parsed.collections.length > 0) params.collection = parsed.collections;
  if (parsed.favorite) params.favorite = true;
  if (parsed.notFavorite) params.favorite = false;
  if (parsed.liked) params.liked = true;
  if (parsed.notLiked) params.liked = false;
  if (parsed.sizes.length > 0) params.size = parsed.sizes.map(comparisonWireForm);
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

/** A collection's files of the app's base kinds, nothing else from the target. */
export function resolveCollectionTarget(
  collection: CollectionSummary,
  baseKinds: readonly FileKind[],
): { usable: true; params: AppTargetParams } {
  assertBaseKinds(baseKinds);
  return {
    usable: true,
    params: { type: [...baseKinds], collection: [collection.name] },
  };
}
