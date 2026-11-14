import type { FileItem, FileType } from "@/types";

export interface SmartQueueEntry {
  id: string;
  title: string;
  file_type: FileType;
  duration: number | null;
}

export interface SmartQueue {
  name: string;
  files: SmartQueueEntry[];
}

const queues = new Map<string, SmartQueue>();

export function smartQueueKey(drive: string, smartFolderId: string): string {
  return `smart-queue:${drive}:${smartFolderId}`;
}

export function smartQueueEntry(file: FileItem): SmartQueueEntry {
  return {
    id: file.id,
    title: file.title,
    file_type: file.file_type,
    duration: file.duration,
  };
}

export function storeSmartQueue(
  drive: string,
  smartFolderId: string,
  queue: SmartQueue,
): void {
  const key = smartQueueKey(drive, smartFolderId);
  queues.set(key, queue);
  try {
    sessionStorage.setItem(key, JSON.stringify(queue));
  } catch {
    // A full quota leaves the older entry behind, which would play a queue the
    // viewer did not just start.
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing else can be done: the tab's memory still holds this queue.
    }
  }
}

export function readSmartQueue(
  drive: string,
  smartFolderId: string,
): SmartQueue | null {
  const key = smartQueueKey(drive, smartFolderId);
  const remembered = queues.get(key);
  if (remembered) return remembered;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SmartQueue;
    if (!parsed || !Array.isArray(parsed.files) || typeof parsed.name !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
