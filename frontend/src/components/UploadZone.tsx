"use client";

import { type DragEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUpload, type UploadFileEntry } from "@/hooks/useUpload";
import { readDirectoryEntries } from "@/lib/directoryReader";
import { classifyDrag, type DragClass } from "@/lib/imageQuery";

interface UploadZoneProps {
  drive: string;
  folderPath: string;
  children: ReactNode;
  className?: string;
  onImageQuery?: (file: File) => void;
  /** A drop classed upload writes here; a search page that never uploaded passes false. */
  acceptUpload?: boolean;
  /** False keeps the element (and its children) mounted without taking drags. */
  enabled?: boolean;
}

export function UploadZone({
  drive,
  folderPath,
  children,
  className,
  onImageQuery,
  acceptUpload = true,
  enabled = true,
}: UploadZoneProps) {
  const t = useTranslations("upload");
  const tSearch = useTranslations("search");
  const [isDragging, setIsDragging] = useState(false);
  const [dragClass, setDragClass] = useState<DragClass | null>(null);
  const dragCounterRef = useRef(0);
  const dragClassRef = useRef<DragClass | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const { addFiles, addFileEntries } = useUpload();

  useEffect(() => {
    if (!enabled) return;
    const el = zoneRef.current;
    if (!el) return;
    function handleUploadFiles(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail || !Array.isArray(detail) || detail.length === 0) return;
      const first = detail[0];
      if (first instanceof File) {
        addFiles(drive, folderPath, detail as File[]);
      } else if (first.file && typeof first.relativePath === "string") {
        addFileEntries(drive, folderPath, detail as UploadFileEntry[]);
      }
    }
    el.addEventListener("upload-files", handleUploadFiles);
    return () => el.removeEventListener("upload-files", handleUploadFiles);
  }, [addFiles, addFileEntries, drive, folderPath, enabled]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragClassRef.current === null) {
      dragClassRef.current = onImageQuery ? classifyDrag(e.dataTransfer) : "upload";
      setDragClass(dragClassRef.current);
    }
    const hasFiles =
      e.dataTransfer.types.includes("Files") || e.dataTransfer.files.length > 0;
    if (
      dragClassRef.current === "one_image" ||
      (acceptUpload && hasFiles)
    ) {
      setIsDragging(true);
    }
  }, [onImageQuery, acceptUpload]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
      dragClassRef.current = null;
      setDragClass(null);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragClassRef.current === "one_image") {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dropped = dragClassRef.current;
      setIsDragging(false);
      dragCounterRef.current = 0;
      dragClassRef.current = null;
      setDragClass(null);

      if (dropped === "one_image" && onImageQuery) {
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 1 && files[0].type.startsWith("image/")) {
          onImageQuery(files[0]);
        }
        return;
      }

      if (!acceptUpload) return;

      try {
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
              addFileEntries(drive, folderPath, allEntries);
            }
            return;
          }
        }
      } catch {
        // Fall through to standard file handling
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        addFiles(drive, folderPath, files);
      }
    },
    [addFiles, addFileEntries, drive, folderPath, onImageQuery, acceptUpload]
  );

  return (
    <div
      ref={zoneRef}
      data-upload-zone={enabled || undefined}
      className={`relative${className ? ` ${className}` : ""}`}
      onDragEnter={enabled ? handleDragEnter : undefined}
      onDragLeave={enabled ? handleDragLeave : undefined}
      onDragOver={enabled ? handleDragOver : undefined}
      onDrop={enabled ? handleDrop : undefined}
    >
      {children}

      {/* No `pointer-events-none` so drop events fire on this element
          and bubble up to the parent's onDrop handler. */}
      {isDragging && (
        <div
          className={`select-none fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm ${
            dragClass === "one_image" ? "bg-bg-primary/75" : "bg-accent/10"
          }`}
        >
          <div
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-12 py-10 ${
              dragClass === "one_image"
                ? "border-warm-silver bg-bg-card/90"
                : "border-accent bg-bg-card/90"
            }`}
          >
            {dragClass === "one_image" ? (
              <>
                <ImagePlus size={48} className="text-text-muted" />
                <p className="text-lg font-medium text-text-primary">
                  {tSearch("dropToSearchByImage")}
                </p>
              </>
            ) : (
              <>
                <Upload size={48} className="text-accent" />
                <p className="text-lg font-medium text-text-primary">
                  {t("dropToUpload")}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
