"use client";

import { getDriveFiles, getSmartFolders } from "@/lib/api";
import { getSemanticAvailability } from "@/lib/addons";
import { fetchSemanticHits } from "@/lib/semanticSearch";
import { evaluateSmartCollection } from "@/lib/smartCollectionEval";
import {
  smartQueueEntry,
  smartQueueKey,
  storeSmartQueue,
  type SmartQueue,
} from "@/lib/smartQueue";

/**
 * A failed evaluation is remembered for the tab, per Smart Collection, so
 * later navigations do not run it again; a reload or a new Play clears it.
 */
const failedSmartQueues = new Set<string>();
const smartQueueLoads = new Map<string, Promise<SmartQueue | null>>();

export function smartQueueFailed(drive: string, smartFolderId: string): boolean {
  return failedSmartQueues.has(smartQueueKey(drive, smartFolderId));
}

async function evaluate(
  drive: string,
  smartFolderId: string,
): Promise<SmartQueue | null> {
  try {
    const folders = await getSmartFolders(drive);
    const folder = folders.find((f) => f.id === smartFolderId);
    if (!folder) return null;
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
    if (!result.complete) return null;
    const files = result.files.filter(
      (f) => f.file_type === "video" || f.file_type === "audio",
    );
    if (files.length === 0) return null;
    const queue: SmartQueue = {
      name: folder.name,
      files: files.map(smartQueueEntry),
    };
    storeSmartQueue(drive, smartFolderId, queue);
    return queue;
  } catch {
    return null;
  }
}

export function loadSmartQueue(
  drive: string,
  smartFolderId: string,
): Promise<SmartQueue | null> {
  const key = smartQueueKey(drive, smartFolderId);
  const running = smartQueueLoads.get(key);
  if (running) return running;

  const load = evaluate(drive, smartFolderId).then((queue) => {
    if (!queue) failedSmartQueues.add(key);
    return queue;
  });
  load.finally(() => {
    if (smartQueueLoads.get(key) === load) smartQueueLoads.delete(key);
  });

  smartQueueLoads.set(key, load);
  return load;
}
