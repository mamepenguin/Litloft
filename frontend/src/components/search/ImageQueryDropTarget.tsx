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
 * does not change shape when availability resolves. It listens on the page
 * frame rather than the document, so a drag on the search modal, which is
 * portalled outside the frame, does not reach it.
 */
export function ImageQueryDropTarget({ onImageQuery }: ImageQueryDropTargetProps) {
  const t = useTranslations("search");
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!onImageQuery) return;
    const frame = document.querySelector<HTMLElement>("[data-page-frame]");
    if (!frame) return;

    let depth = 0;
    let dragClass: "one_image" | "upload" | null = null;
    const reset = () => {
      depth = 0;
      dragClass = null;
      setOverlay(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      if (dragClass === null) {
        dragClass = classifyDrag(event.dataTransfer);
      }
      if (dragClass !== "one_image") return;
      event.preventDefault();
      depth += 1;
      setOverlay(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer) || dragClass !== "one_image") return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer) || dragClass !== "one_image") return;
      depth -= 1;
      if (depth <= 0) reset();
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event.dataTransfer)) return;
      const kept = dragClass;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (kept === "one_image") {
        event.preventDefault();
      }
      reset();
      if (
        kept === "one_image" &&
        files.length === 1 &&
        files[0].type.startsWith("image/")
      ) {
        onImageQuery(files[0]);
      }
    };

    frame.addEventListener("dragenter", onDragEnter);
    frame.addEventListener("dragover", onDragOver);
    frame.addEventListener("dragleave", onDragLeave);
    frame.addEventListener("drop", onDrop);
    return () => {
      reset();
      frame.removeEventListener("dragenter", onDragEnter);
      frame.removeEventListener("dragover", onDragOver);
      frame.removeEventListener("dragleave", onDragLeave);
      frame.removeEventListener("drop", onDrop);
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
