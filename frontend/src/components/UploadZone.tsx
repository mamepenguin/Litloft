"use client";

import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUpload, type UploadFileEntry } from "@/hooks/useUpload";
import { readDirectoryEntries } from "@/lib/directoryReader";
import { UploadProgress } from "./UploadProgress";

interface UploadZoneProps {
  drive: string;
  folderPath: string;
  onUploadComplete?: () => void;
  children: ReactNode;
}

export function UploadZone({
  drive,
  folderPath,
  onUploadComplete,
  children,
}: UploadZoneProps) {
  const t = useTranslations("upload");
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const zoneRef = useRef<HTMLDivElement>(null);
  const { uploads, addFiles, addFileEntries, cancelUpload, clearCompleted } = useUpload(
    drive,
    folderPath,
    onUploadComplete,
  );

  // Listen for upload-files custom event (File[] or UploadFileEntry[])
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return;
    function handleUploadFiles(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail || !Array.isArray(detail) || detail.length === 0) return;
      const first = detail[0];
      if (first instanceof File) {
        addFiles(detail as File[]);
      } else if (first.file && typeof first.relativePath === "string") {
        addFileEntries(detail as UploadFileEntry[]);
      }
    }
    el.addEventListener("upload-files", handleUploadFiles);
    return () => el.removeEventListener("upload-files", handleUploadFiles);
  }, [addFiles, addFileEntries]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      const items = e.dataTransfer.items;
      if (items) {
        const webkitEntries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) {
            webkitEntries.push(entry);
          }
        }

        const hasDirectory = webkitEntries.some((e) => e.isDirectory);
        if (hasDirectory) {
          const allEntries: UploadFileEntry[] = [];
          for (const entry of webkitEntries) {
            if (entry.isDirectory) {
              const dirEntries = await readDirectoryEntries(
                entry as FileSystemDirectoryEntry,
                entry.name
              );
              allEntries.push(...dirEntries);
            } else if (entry.isFile) {
              const file = await new Promise<File>((resolve, reject) => {
                (entry as FileSystemFileEntry).file(resolve, reject);
              });
              allEntries.push({ file, relativePath: "" });
            }
          }
          if (allEntries.length > 0) {
            addFileEntries(allEntries);
          }
          return;
        }
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles, addFileEntries]
  );

  const handleClearCompleted = useCallback(() => {
    clearCompleted();
    if (onUploadComplete) {
      onUploadComplete();
    }
  }, [clearCompleted, onUploadComplete]);

  const hasActiveUploads = uploads.length > 0;

  return (
    <div
      ref={zoneRef}
      data-upload-zone
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-bg-card/90 px-12 py-10">
            <Upload size={48} className="text-accent" />
            <p className="text-lg font-medium text-text-primary">
              {t("dropToUpload")}
            </p>
          </div>
        </div>
      )}

      {/* Upload progress panel */}
      {hasActiveUploads && (
        <UploadProgress
          uploads={uploads}
          onCancel={cancelUpload}
          onClearCompleted={handleClearCompleted}
        />
      )}
    </div>
  );
}
