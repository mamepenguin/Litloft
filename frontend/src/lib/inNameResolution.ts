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
  | { status: "tooLarge" };

export type InNameSaveCheck = "ok" | "refused" | "failed";

interface ClassifiedNames {
  /** The names sent as collection names, in the query's order. */
  collections: string[];
  smart: SmartFolder[];
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function classifyNames(
  drive: string,
  names: readonly string[],
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
  const collectionNamesOnly = names.filter((name) =>
    collectionNames.has(name.toLowerCase()),
  );
  const remaining = names.filter(
    (name) => !collectionNames.has(name.toLowerCase()),
  );
  if (remaining.length === 0) {
    return { collections: [...collectionNamesOnly], smart: [] };
  }

  let smartFolders: SmartFolder[];
  try {
    smartFolders = await io.getSmartFolders(drive);
  } catch {
    if (signal?.aborted) throw abortError();
    return "failed";
  }
  throwIfAborted(signal);

  const sent: string[] = [];
  const smart: SmartFolder[] = [];
  for (const name of names) {
    if (collectionNames.has(name.toLowerCase())) {
      sent.push(name);
      continue;
    }
    const match = smartFolders.find(
      (folder) => folder.name.toLowerCase() === name.toLowerCase(),
    );
    if (match) smart.push(match);
    else sent.push(name);
  }
  return { collections: sent, smart };
}

/** The drive and the query's `in:` names lower-cased, as a set. */
export function inNamesKey(
  drive: string,
  parsed: Pick<ParsedQuery, "collections">,
): string {
  if (parsed.collections.length === 0) return "";
  const names = [...new Set(parsed.collections.map((name) => name.toLowerCase()))].sort();
  return `${drive}\u0000${names.join("\u0000")}`;
}

export async function checkInNamesForSave(
  drive: string,
  parsed: Pick<ParsedQuery, "collections">,
  io: Pick<InNameIo, "getCollections" | "getSmartFolders">,
): Promise<InNameSaveCheck> {
  if (parsed.collections.length === 0) return "ok";
  const classified = await classifyNames(drive, parsed.collections, io);
  if (classified === "failed") return "failed";
  return classified.smart.length > 0 ? "refused" : "ok";
}

export async function resolveInNames(
  drive: string,
  parsed: Pick<ParsedQuery, "collections">,
  signal: AbortSignal | undefined,
  io: InNameIo,
): Promise<InNameResolution> {
  if (parsed.collections.length === 0) {
    return { status: "resolved", collections: [], fileIds: null };
  }

  const classified = await classifyNames(drive, parsed.collections, io, signal);
  if (classified === "failed") return { status: "failed" };
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
        },
        io,
      );
    } catch {
      if (signal?.aborted) throw abortError();
      return { status: "failed" };
    }
    throwIfAborted(signal);
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
