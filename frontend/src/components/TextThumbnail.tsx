"use client";

import { useEffect, useRef, useState } from "react";
import type { FileItem } from "@/types";
import { FileTypeIcon } from "./FileTypeIcon";

function stripPreviewText(raw: string): string {
  return raw
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^#+ /gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function TextThumbnail({ file, textClassName = "text-base" }: { file: FileItem; textClassName?: string }) {
  const [text, setText] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observerRef.current?.disconnect();
          fetch(`/api/files/${file.id}/stream`, {
            headers: { Range: "bytes=0-399" },
          })
            .then((res) => {
              if (!res.ok) return;
              return res.text();
            })
            .then((raw) => {
              if (raw != null) {
                setText(stripPreviewText(raw));
              }
            })
            .catch(() => {});
        }
      },
      { rootMargin: "50px" }
    );

    observerRef.current.observe(el);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [file.id]);

  return (
    <div ref={containerRef} className="h-full w-full relative overflow-hidden">
      {text ? (
        <>
          <div className={`${textClassName} leading-snug font-mono text-text-muted p-2 select-none whitespace-pre-wrap break-all`}>
            {text}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-bg-elevated to-transparent pointer-events-none" />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <FileTypeIcon fileType={file.file_type} size={22} className="text-text-muted" />
        </div>
      )}
    </div>
  );
}
