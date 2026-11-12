"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import { SeekableDescription } from "../SeekableDescription";

interface FileDescriptionProps {
  file: FileItem;
  isTimedMedia: boolean;
  mediaController: MediaController | null;
  className?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
}

export function FileDescription({
  file,
  isTimedMedia,
  mediaController,
  className,
  expanded,
  onToggleExpanded,
}: FileDescriptionProps) {
  const t = useTranslations("workbench");
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [overflow, setOverflow] = useState(false);

  const measure = useCallback(() => {
    if (expanded) return;
    const node = textRef.current;
    if (!node) return;
    const next = node.scrollHeight > node.clientHeight + 1;
    setOverflow((previous) => (previous === next ? previous : next));
  }, [expanded]);

  useLayoutEffect(() => {
    measure();
  }, [measure, file.id, file.description]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const node = textRef.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  if (!file.description) return null;

  return (
    <div className={className}>
      <p
        ref={textRef}
        className={`text-sm whitespace-pre-wrap text-text-muted${
          expanded ? "" : " line-clamp-3"
        }`}
      >
        {isTimedMedia ? (
          <SeekableDescription
            text={file.description}
            durationSeconds={file.duration}
            mediaController={mediaController}
          />
        ) : (
          file.description
        )}
      </p>
      {overflow && (
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="mt-1 text-xs font-semibold text-text-primary"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}
