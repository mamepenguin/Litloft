"use client";

import { useCallback, useRef, useState } from "react";

import {
  cancelUpload as apiCancelUpload,
  completeUpload,
  initUpload,
  uploadChunk,
} from "@/lib/api";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CONCURRENT = 2;

export type UploadStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "complete"
  | "error"
  | "cancelled";

export interface UploadState {
  id: string;
  filename: string;
  progress: number;
  status: UploadStatus;
  error?: string;
}

interface InternalUpload {
  file: File;
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

    try {
      updateUpload(id, { status: "uploading", progress: 0 });

      const initResult = await initUpload(drive, {
        filename: file.name,
        file_size: file.size,
        folder_path: folderPath,
        chunk_size: CHUNK_SIZE,
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

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
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
          err instanceof Error ? err.message : "アップロードに失敗しました";
        updateUpload(id, { status: "error", error: message });
      }
    } finally {
      activeCountRef.current -= 1;
      processNext();
    }
  }

  const addFiles = useCallback(
    (files: File[]) => {
      const newUploads: UploadState[] = files.map((file) => {
        const id = generateId();
        internalsRef.current.set(id, { file, aborted: false });
        queueRef.current.push(id);
        return {
          id,
          filename: file.name,
          progress: 0,
          status: "pending" as const,
        };
      });

      setUploads((prev) => [...prev, ...newUploads]);

      // Use setTimeout to ensure state is updated before processing
      setTimeout(() => processNext(), 0);
    },
    [processNext]
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
    cancelUpload: cancelUploadById,
    clearCompleted,
  };
}
