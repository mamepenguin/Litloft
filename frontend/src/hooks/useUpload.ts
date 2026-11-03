"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  cancelUpload as apiCancelUpload,
  completeUpload,
  initUpload,
  uploadChunk,
} from "@/lib/api";

const MAX_CONCURRENT = 2;
export const DESTINATION_FOLDER_NOT_FOUND = "destination_folder_not_found";

// Pick a chunk size that keeps total chunk count reasonable for large files.
// Browser File.slice() is cheap, but every chunk is a separate POST round-trip,
// so 10k+ chunks add measurable overhead on multi-GB uploads.
function pickChunkSize(fileSize: number): number {
  const MB = 1024 * 1024;
  if (fileSize <= 1024 * MB) return 5 * MB;
  if (fileSize <= 10 * 1024 * MB) return 25 * MB;
  return 100 * MB;
}

export type UploadStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "complete"
  | "error"
  | "cancelled";

export interface UploadFileEntry {
  file: File;
  relativePath: string;
}

export interface UploadState {
  id: string;
  filename: string;
  relativePath: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  drive: string;
  folder: string;
}

interface InternalUpload {
  drive: string;
  folderPath: string;
  file: File;
  relativePath: string;
  uploadId?: string;
  aborted: boolean;
}

let nextId = 0;
function generateId(): string {
  nextId += 1;
  return `upload-${Date.now()}-${nextId}`;
}

const EMPTY_UPLOADS: UploadState[] = [];
let uploads: UploadState[] = EMPTY_UPLOADS;
let pendingQueue: string[] = [];
let activeCount = 0;
const internals = new Map<string, InternalUpload>();
const listeners = new Set<() => void>();
const completionListeners = new Set<(drive: string) => void>();
let leaveSuppressed = false;

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): UploadState[] {
  return uploads;
}

function getServerSnapshot(): UploadState[] {
  return EMPTY_UPLOADS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isUnfinished(entry: UploadState): boolean {
  return (
    entry.status === "pending" ||
    entry.status === "uploading" ||
    entry.status === "processing"
  );
}

function hasUnfinished(): boolean {
  return uploads.some(isUnfinished);
}

function updateUpload(id: string, patch: Partial<UploadState>) {
  uploads = uploads.map((upload) =>
    upload.id === id ? { ...upload, ...patch } : upload,
  );
  emit();
}

function notifyComplete(drive: string) {
  for (const listener of completionListeners) listener(drive);
}

function processNext() {
  while (activeCount < MAX_CONCURRENT && pendingQueue.length > 0) {
    const id = pendingQueue.shift();
    if (!id) break;
    const internal = internals.get(id);
    if (!internal || internal.aborted) continue;
    activeCount += 1;
    void processUpload(id, internal);
  }
}

async function processUpload(id: string, internal: InternalUpload) {
  const { file, drive, folderPath } = internal;
  const chunkSize = pickChunkSize(file.size);

  try {
    updateUpload(id, { status: "uploading", progress: 0 });

    const initResult = await initUpload(drive, {
      filename: file.name,
      file_size: file.size,
      folder_path: folderPath,
      chunk_size: chunkSize,
      relative_path: internal.relativePath,
      require_folder: true,
    });

    internal.uploadId = initResult.upload_id;

    if (internal.aborted) {
      await apiCancelUpload(drive, initResult.upload_id);
      return;
    }

    const totalChunks = initResult.total_chunks;

    for (let i = 0; i < totalChunks; i++) {
      if (internal.aborted) {
        await apiCancelUpload(drive, initResult.upload_id);
        return;
      }

      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      await uploadChunk(drive, initResult.upload_id, i, chunk);

      const progress = Math.round(((i + 1) / totalChunks) * 95);
      updateUpload(id, { progress });
    }

    if (internal.aborted) {
      await apiCancelUpload(drive, initResult.upload_id);
      return;
    }

    updateUpload(id, { status: "processing", progress: 95 });
    await completeUpload(drive, initResult.upload_id);
    updateUpload(id, { status: "complete", progress: 100 });
    notifyComplete(drive);
  } catch (err) {
    if (!internal.aborted) {
      const message = err instanceof Error ? err.message : "Upload failed";
      updateUpload(id, { status: "error", error: message });
    }
  } finally {
    activeCount -= 1;
    processNext();
  }
}

function addFileEntries(
  drive: string,
  folderPath: string,
  entries: UploadFileEntry[],
) {
  const added = entries.map((entry) => {
    const id = generateId();
    internals.set(id, {
      drive,
      folderPath,
      file: entry.file,
      relativePath: entry.relativePath,
      aborted: false,
    });
    pendingQueue.push(id);
    return {
      id,
      filename: entry.file.name,
      relativePath: entry.relativePath,
      progress: 0,
      status: "pending" as const,
      drive,
      folder: folderPath,
    };
  });

  uploads = [...uploads, ...added];
  emit();
  setTimeout(processNext, 0);
}

function addFiles(drive: string, folderPath: string, files: File[]) {
  addFileEntries(
    drive,
    folderPath,
    files.map((file) => ({ file, relativePath: "" })),
  );
}

function cancelUploadById(id: string) {
  const entry = uploads.find((upload) => upload.id === id);
  if (!entry || (entry.status !== "pending" && entry.status !== "uploading")) {
    return;
  }

  const internal = internals.get(id);
  if (internal) {
    internal.aborted = true;
    if (internal.uploadId) {
      apiCancelUpload(internal.drive, internal.uploadId).catch(() => {
        // Best-effort cancel
      });
    }
  }
  pendingQueue = pendingQueue.filter((queuedId) => queuedId !== id);
  updateUpload(id, { status: "cancelled" });
}

function clearCompleted() {
  const removed = new Set(
    uploads
      .filter(
        (upload) =>
          upload.status === "complete" ||
          upload.status === "error" ||
          upload.status === "cancelled",
      )
      .map((upload) => upload.id),
  );
  if (removed.size === 0) return;
  uploads = uploads.filter((upload) => !removed.has(upload.id));
  for (const id of removed) internals.delete(id);
  emit();
}

/** The lock's own reload must not ask the leave-page question again. */
export function disarmLeaveConfirmation() {
  leaveSuppressed = true;
}

/** Whether the browser's leave-page confirmation should hold the tab. */
export function leaveConfirmationArmed(): boolean {
  return !leaveSuppressed && hasUnfinished();
}

/** Empty the store. Tests call this between cases; the app never does. */
export function resetUploadStore() {
  uploads = EMPTY_UPLOADS;
  pendingQueue = [];
  activeCount = 0;
  internals.clear();
  leaveSuppressed = false;
  emit();
}

export function useUpload() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    uploads: snapshot,
    addFiles,
    addFileEntries,
    cancelUpload: cancelUploadById,
    clearCompleted,
  };
}

/** Runs `onComplete` when a file finishes uploading to `drive`. */
export function useUploadCompleted(drive: string, onComplete: () => void) {
  const callbackRef = useRef(onComplete);

  useEffect(() => {
    callbackRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const listener = (completedDrive: string) => {
      if (completedDrive === drive) callbackRef.current();
    };
    completionListeners.add(listener);
    return () => {
      completionListeners.delete(listener);
    };
  }, [drive]);
}
