"use client";

import { type DragEvent, type ReactNode, useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useUpload } from "@/hooks/useUpload";
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
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const { uploads, addFiles, cancelUpload, clearCompleted } = useUpload(
    drive,
    folderPath
  );

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
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles]
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
              ファイルをドロップしてアップロード
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
