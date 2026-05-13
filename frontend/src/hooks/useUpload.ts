"use client";

import { useCallback, useRef, useState } from "react";

import {
  cancelUpload as apiCancelUpload,
  completeUpload,
  initUpload,
  uploadChunk,
} from "@/lib/api";

const MAX_CONCURRENT = 2;

// Pick a chunk size that keeps total chunk count reasonable for large files.
// Browser File.slice() is cheap, but every chunk is a separate POST round-trip,
// so 10k+ chunks add measurable overhead on multi-GB uploads.
function pickChunkSize(fileSize: number): number {
  const MB = 1024 * 1024;
  if (fileSize <= 1024 * MB) return 5 * MB;       // <= 1GB
  if (fileSize <= 10 * 1024 * MB) return 25 * MB; // <= 10GB
  return 100 * MB;                                 // > 10GB
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
}

interface InternalUpload {
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

export function useUpload(drive: string, folderPath: string, onFileComplete?: () => void) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const internalsRef = useRef<Map<string, InternalUpload>>(new Map());
  const activeCountRef = useRef(0);
  const queueRef = useRef<string[]>([]);

  const updateUpload = useCallback(
    (id: string, patch: Partial<UploadState>) => {
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
      );
    },
    []
  );

  const processNext = useCallback(() => {
    while (
      activeCountRef.current < MAX_CONCURRENT &&
      queueRef.current.length > 0
    ) {
      const id = queueRef.current.shift();
      if (!id) break;
      const internal = internalsRef.current.get(id);
      if (!internal || internal.aborted) continue;
      activeCountRef.current += 1;
      processUpload(id, internal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drive, folderPath]);

  async function processUpload(id: string, internal: InternalUpload) {
    const { file } = internal;

    const chunkSize = pickChunkSize(file.size);

    try {
      updateUpload(id, { status: "uploading", progress: 0 });

      const initResult = await initUpload(drive, {
        filename: file.name,
        file_size: file.size,
        folder_path: folderPath,
        chunk_size: chunkSize,
        relative_path: internal.relativePath,
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
      onFileComplete?.();
    } catch (err) {
      if (!internal.aborted) {
        const message =
          err instanceof Error ? err.message : "Upload failed";
        updateUpload(id, { status: "error", error: message });
      }
    } finally {
      activeCountRef.current -= 1;
      processNext();
    }
  }

  const addFileEntries = useCallback(
    (entries: UploadFileEntry[]) => {
      const newUploads: UploadState[] = entries.map((entry) => {
        const id = generateId();
        internalsRef.current.set(id, {
          file: entry.file,
          relativePath: entry.relativePath,
          aborted: false,
        });
        queueRef.current.push(id);
        return {
          id,
          filename: entry.file.name,
          relativePath: entry.relativePath,
          progress: 0,
          status: "pending" as const,
        };
      });

      setUploads((prev) => [...prev, ...newUploads]);
      setTimeout(() => processNext(), 0);
    },
    [processNext]
  );

  const addFiles = useCallback(
    (files: File[]) => {
      addFileEntries(files.map((file) => ({ file, relativePath: "" })));
    },
    [addFileEntries]
  );

  const cancelUploadById = useCallback(
    (id: string) => {
      const internal = internalsRef.current.get(id);
      if (internal) {
        internal.aborted = true;
        if (internal.uploadId) {
          apiCancelUpload(drive, internal.uploadId).catch(() => {
            // Best-effort cancel
          });
        }
      }
      updateUpload(id, { status: "cancelled" });
      // Remove from queue if still pending
      queueRef.current = queueRef.current.filter((qId) => qId !== id);
    },
    [drive, updateUpload]
  );

  const clearCompleted = useCallback(() => {
    setUploads((prev) =>
      prev.filter(
        (u) =>
          u.status !== "complete" &&
          u.status !== "error" &&
          u.status !== "cancelled"
      )
    );
    // Clean up internals for completed
    for (const [id, internal] of internalsRef.current.entries()) {
      if (internal.aborted) {
        internalsRef.current.delete(id);
      }
    }
  }, []);

  return {
    uploads,
    addFiles,
    addFileEntries,
    cancelUpload: cancelUploadById,
    clearCompleted,
  };
}
