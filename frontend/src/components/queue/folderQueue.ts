import { getDriveFiles } from "@/lib/api";
import type { FileItem, FileType, SortField, SortOrder } from "@/types";

export interface FolderQueueEntry {
  id: string;
  title: string;
  file_type: FileType;
  duration: number | null;
}

export interface FolderQueue {
  name: string;
  files: FolderQueueEntry[];
}

export function folderQueueKey(drive: string, path: string): string {
  return `folder-queue:${drive}:${path}`;
}

export function folderQueueHref(drive: string, path: string): string {
  const folderPart = path
    ? "/" + path.split("/").filter(Boolean).map(encodeURIComponent).join("/")
    : "";
  return `/drive/${encodeURIComponent(drive)}${folderPart}`;
}

export function folderQueueEntry(file: FileItem): FolderQueueEntry {
  return {
    id: file.id,
    title: file.title,
    file_type: file.file_type,
    duration: file.duration,
  };
}

export function storeFolderQueue(
  drive: string,
  path: string,
  files: readonly FileItem[],
): void {
  const key = folderQueueKey(drive, path);
  const queue: FolderQueue = {
    name: path ? path.split("/").pop() || drive : drive,
    files: files.map(folderQueueEntry),
  };
  try {
    sessionStorage.setItem(key, JSON.stringify(queue));
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing else can be done: the older entry must not outlive this press.
    }
  }
}

export function readFolderQueue(
  drive: string,
  path: string,
): FolderQueue | null {
  try {
    const raw = sessionStorage.getItem(folderQueueKey(drive, path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FolderQueue;
    if (!parsed || !Array.isArray(parsed.files) || typeof parsed.name !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** The folder's audio and video files, page by page in the given order. */
export async function fetchFolderQueue(
  drive: string,
  path: string,
  sort?: string,
  order?: string,
): Promise<FileItem[]> {
  // `random` is a listing order the queue cannot store; with nothing stored
  // for the tab, it falls back to the default rather than a new shuffle.
  const effectiveSort = sort === "random" ? undefined : sort;
  const effectiveOrder = sort === "random" ? undefined : order;
  const allFiles: FileItem[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await getDriveFiles(drive, {
      path,
      type: ["audio", "video"],
      sort: (effectiveSort || "created_at") as SortField,
      order: (effectiveOrder || "desc") as SortOrder,
      limit: 500,
      page,
    });
    allFiles.push(...res.data);
    hasMore = res.meta.total > page * 500;
    page++;
  }
  return allFiles;
}
