import type { FileItem, FileType } from "@/types";

/** What a queue needs to know about one item, whichever kind of queue it is. */
export interface QueueEntry {
  id: string;
  title: string;
  file_type: FileType;
  duration: number | null;
  missing_since?: string | null;
  deleted_at?: string | null;
}

export interface QueueWalk {
  prevId: string | null;
  nextId: string | null;
  position: number | null;
  total: number | null;
}

/** A Smart queue entry carries no state, so it counts as playable. */
export function isPlayable(entry: QueueEntry): boolean {
  return (
    (entry.file_type === "video" || entry.file_type === "audio") &&
    !entry.missing_since &&
    !entry.deleted_at
  );
}

export function queueEntryFromFile(file: FileItem): QueueEntry {
  return {
    id: file.id,
    title: file.title,
    file_type: file.file_type,
    duration: file.duration,
    missing_since: file.missing_since,
    deleted_at: file.deleted_at,
  };
}

/**
 * The first playable entry after `currentId`, wrapping to the queue's start
 * only when looping. The ended entry itself is never chosen again.
 */
export function nextPlayableAfter(
  entries: readonly QueueEntry[],
  currentId: string,
  loop: boolean,
): QueueEntry | null {
  const current = entries.findIndex((entry) => entry.id === currentId);
  if (current === -1) return null;

  for (let i = current + 1; i < entries.length; i += 1) {
    if (isPlayable(entries[i])) return entries[i];
  }
  if (!loop) return null;
  for (let i = 0; i < current; i += 1) {
    if (isPlayable(entries[i])) return entries[i];
  }
  return null;
}

/** The item before and after the open file, over every entry and never wrapping. */
export function queueWalk(
  entries: readonly QueueEntry[],
  currentId: string | null,
): QueueWalk {
  const index =
    currentId === null
      ? -1
      : entries.findIndex((entry) => entry.id === currentId);
  return {
    prevId: index > 0 ? entries[index - 1].id : null,
    nextId: index >= 0 && index < entries.length - 1 ? entries[index + 1].id : null,
    position: index >= 0 ? index + 1 : null,
    total: entries.length,
  };
}
