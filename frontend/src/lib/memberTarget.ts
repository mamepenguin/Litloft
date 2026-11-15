import type { ListingRequestParams } from "./listingRequest";
import {
  getDriveFiles,
  getDriveFilesWithFileIds,
  getShelves,
  getShelvesWithFileIds,
  type ShelvesParams,
  type ShelvesResponse,
} from "./api";
import { getSemanticAvailability } from "./addons";
import { MEMBER_ID_LIMIT } from "./inNameResolution";
import { kindHolds, parseSearchQuery, resolveKinds } from "./searchQuery";
import { fetchSemanticHits } from "./semanticSearch";
import { evaluateSmartCollection } from "./smartCollectionEval";
import type { FileKind, PaginatedResponse } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

/** A Smart Collection target the app sends the evaluated members of. */
export interface MemberTarget {
  id: string;
  /** The kinds its requests carry, within the app's base kinds; empty when none meet them. */
  kinds: FileKind[];
}

/** The app's two request shapes, bound to a member set when the target has one. */
export interface AppRequests {
  /** The target's identity for a load key; `""` outside a member target. */
  key: string;
  /** The members every request carries; `null` outside a member target. */
  fileIds: readonly string[] | null;
  files: (drive: string, params: ListingRequestParams) => Promise<PaginatedResponse>;
  shelves: (drive: string, params: ShelvesParams) => Promise<ShelvesResponse>;
}

export type MemberEvaluation =
  | { status: "ready"; fileIds: string[] }
  | { status: "failed" }
  | { status: "tooLarge" };

const LISTING_REQUESTS: AppRequests = {
  key: "",
  fileIds: null,
  files: getDriveFiles,
  shelves: getShelves,
};

export function appRequests(
  target: MemberTarget | null,
  fileIds: readonly string[] | null,
): AppRequests {
  if (target === null) return LISTING_REQUESTS;
  const members = fileIds ?? [];
  return {
    key: `member\u0000${target.id}`,
    fileIds: members,
    files: (drive, params) => getDriveFilesWithFileIds(drive, params, members),
    shelves: (drive, params) => getShelvesWithFileIds(drive, params, members),
  };
}

/**
 * `null` when the folder is resolved to listing parameters instead. A query
 * with free text is a member target whatever else it holds, as its search page
 * treats it.
 */
export function resolveMemberTarget(
  folder: SmartFolder | null,
  baseKinds: readonly FileKind[],
): MemberTarget | null {
  if (folder === null) return null;
  const parsed = parseSearchQuery(folder.query);
  if (parsed.text === "") return null;

  const { kinds, impossible } = resolveKinds(folder.file_type, parsed.types);
  if (impossible) return { id: folder.id, kinds: [] };
  if (kinds.length === 0) return { id: folder.id, kinds: [...baseKinds] };
  return {
    id: folder.id,
    kinds: baseKinds.filter((kind) => kinds.some((named) => kindHolds(named, kind))),
  };
}

export async function evaluateMemberTarget(
  drive: string,
  folder: SmartFolder,
): Promise<MemberEvaluation> {
  try {
    const result = await evaluateSmartCollection(
      {
        drive,
        query: folder.query.trim(),
        type: folder.file_type,
        sort: "relevance",
        order: "desc",
        includeSceneClip: false,
      },
      { getDriveFiles, getSemanticAvailability, fetchSemanticHits },
    );
    if (!result.complete) return { status: "failed" };
    if (result.files.length > MEMBER_ID_LIMIT) return { status: "tooLarge" };
    return { status: "ready", fileIds: result.files.map((file) => file.id) };
  } catch {
    return { status: "failed" };
  }
}
