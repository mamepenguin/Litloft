import type { CollectionSummary } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

import type { ParsedQuery } from "./searchQuery";
import {
  evaluateSmartCollection,
  type SmartCollectionEvalIo,
} from "./smartCollectionEval";

export const MEMBER_ID_LIMIT = 10_000;

export interface InNameIo extends SmartCollectionEvalIo {
  getCollections: (drive: string) => Promise<CollectionSummary[]>;
  getSmartFolders: (drive: string) => Promise<SmartFolder[]>;
}

export type InNameResolution =
  | { status: "resolved"; collections: string[]; fileIds: string[] | null }
  | { status: "failed" }
  | { status: "tooLarge" }
  /** A `-in:` name is only a Smart Collection's, which cannot be expanded here. */
  | { status: "refused" };

export type InNameSaveCheck = "ok" | "refused" | "failed";

interface ClassifiedNames {
  /** The positive names sent as collection names, in the query's order. */
  collections: string[];
  smart: SmartFolder[];
  /** Whether a negated name is only a Smart Collection's. */
  refused: boolean;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function classifyNames(
  drive: string,
  positive: readonly string[],
  negative: readonly string[],
  io: Pick<InNameIo, "getCollections" | "getSmartFolders">,
  signal?: AbortSignal,
): Promise<ClassifiedNames | "failed"> {
  let collections: CollectionSummary[];
  try {
    collections = await io.getCollections(drive);
  } catch {
    if (signal?.aborted) throw abortError();
    return "failed";
  }
  throwIfAborted(signal);

  const collectionNames = new Set(collections.map((entry) => entry.name.toLowerCase()));
  const carries = (name: string) => collectionNames.has(name.toLowerCase());
  if ([...positive, ...negative].every(carries)) {
    return { collections: [...positive], smart: [], refused: false };
  }

  let smartFolders: SmartFolder[];
  try {
    smartFolders = await io.getSmartFolders(drive);
  } catch {
    if (signal?.aborted) throw abortError();
    return "failed";
  }
  throwIfAborted(signal);

  const find = (name: string) =>
    smartFolders.find((folder) => folder.name.toLowerCase() === name.toLowerCase());

  const sent: string[] = [];
  const smart: SmartFolder[] = [];
  for (const name of positive) {
    if (carries(name)) sent.push(name);
    else {
      const match = find(name);
      if (match) smart.push(match);
      else sent.push(name);
    }
  }

  let refused = false;
  for (const name of negative) {
    if (!carries(name) && find(name)) refused = true;
  }
  return { collections: sent, smart, refused };
}

function inKeyNames(
  parsed: Pick<ParsedQuery, "collections" | "excludedCollections">,
): string[] {
  return [
    ...parsed.collections.map((name) => `+${name.toLowerCase()}`),
    ...parsed.excludedCollections.map((name) => `-${name.toLowerCase()}`),
  ];
}

/** The drive and the query's `in:` and `-in:` names with their polarity. */
export function inNamesKey(
  drive: string,
  parsed: Pick<ParsedQuery, "collections" | "excludedCollections">,
): string {
  const names = inKeyNames(parsed);
  if (names.length === 0) return "";
  return `${drive}\u0000${[...new Set(names)].sort().join("\u0000")}`;
}

export async function checkInNamesForSave(
  drive: string,
  parsed: Pick<ParsedQuery, "collections" | "excludedCollections">,
  io: Pick<InNameIo, "getCollections" | "getSmartFolders">,
): Promise<InNameSaveCheck> {
  if (parsed.collections.length === 0 && parsed.excludedCollections.length === 0) {
    return "ok";
  }
  const classified = await classifyNames(
    drive,
    parsed.collections,
    parsed.excludedCollections,
    io,
  );
  if (classified === "failed") return "failed";
  return classified.smart.length > 0 || classified.refused ? "refused" : "ok";
}

export async function resolveInNames(
  drive: string,
  parsed: Pick<ParsedQuery, "collections" | "excludedCollections">,
  signal: AbortSignal | undefined,
  io: InNameIo,
  now?: number,
): Promise<InNameResolution> {
  if (parsed.collections.length === 0 && parsed.excludedCollections.length === 0) {
    return { status: "resolved", collections: [], fileIds: null };
  }

  const classified = await classifyNames(
    drive,
    parsed.collections,
    parsed.excludedCollections,
    io,
    signal,
  );
  if (classified === "failed") return { status: "failed" };
  if (classified.refused) return { status: "refused" };
  if (classified.smart.length === 0) {
    return {
      status: "resolved",
      collections: classified.collections,
      fileIds: null,
    };
  }

  const ids = new Set<string>();
  for (const folder of classified.smart) {
    let result;
    try {
      result = await evaluateSmartCollection(
        {
          drive,
          query: folder.query,
          type: folder.file_type,
          sort: "relevance",
          order: "desc",
          includeSceneClip: false,
          now,
          memberLimit: MEMBER_ID_LIMIT,
        },
        io,
      );
    } catch {
      if (signal?.aborted) throw abortError();
      return { status: "failed" };
    }
    throwIfAborted(signal);
    if (result.overLimit) return { status: "tooLarge" };
    if (!result.complete) return { status: "failed" };
    for (const file of result.files) {
      ids.add(file.id);
      if (ids.size > MEMBER_ID_LIMIT) return { status: "tooLarge" };
    }
  }

  return {
    status: "resolved",
    collections: classified.collections,
    fileIds: [...ids],
  };
}
