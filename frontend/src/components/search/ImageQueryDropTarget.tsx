"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { classifyDrag } from "@/lib/imageQuery";

interface ImageQueryDropTargetProps {
  /** Present only while image search is available for the drive. */
  onImageQuery?: (file: File) => void;
}

function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && (dt.types.includes("Files") || dt.files.length > 0);
}

/**
 * The text-query results page's own drop target. It renders no wrapper and no
 * DOM until a drag classed one image is over the page, so the results subtree
 * does not change shape when availability resolves.
 */
export function ImageQueryDropTarget({ onImageQuery }: ImageQueryDropTargetProps) {
  const t = useTranslations("search");
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!onImageQuery) return;

    let depth = 0;
    let dragClass: "one_image" | "upload" | null = null;
    const reset = () => {
      depth = 0;
      dragClass = null;
      setOverlay(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth += 1;
      if (dragClass === null) {
        dragClass = classifyDrag(event.dataTransfer);
        setOverlay(dragClass === "one_image");
      }
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      depth -= 1;
      if (depth <= 0) reset();
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      const kept = dragClass;
      const files = Array.from(event.dataTransfer?.files ?? []);
      reset();
      if (
        kept === "one_image" &&
        files.length === 1 &&
        files[0].type.startsWith("image/")
      ) {
        onImageQuery(files[0]);
      }
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      reset();
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [onImageQuery]);

  if (!overlay || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/75 backdrop-blur-sm"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-warm-silver bg-bg-card/90 px-12 py-10">
        <ImagePlus size={48} className="text-text-muted" />
        <p className="text-lg font-medium text-text-primary">
          {t("dropToSearchByImage")}
        </p>
      </div>
    </div>,
    document.body,
  );
}
