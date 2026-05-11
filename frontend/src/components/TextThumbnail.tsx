"use client";

import { useEffect, useRef, useState } from "react";
import type { FileItem } from "@/types";

const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

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

export function TextThumbnail({ file }: { file: FileItem }) {
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

          const isOffice = OFFICE_MIMES.has(file.mime_type ?? "");
          const fetchPromise = isOffice
            ? fetch(`/api/files/${file.id}/preview-text`)
            : fetch(`/api/files/${file.id}/stream`, {
                headers: { Range: "bytes=0-399" },
              });

          fetchPromise
            .then((res) => {
              if (!res.ok) return;
              return res.text();
            })
            .then((raw) => {
              if (raw != null) {
                setText(isOffice ? raw.trim() : stripPreviewText(raw));
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
  }, [file.id, file.mime_type]);

  return (
    <div ref={containerRef} className="h-full w-full relative overflow-hidden bg-bg-elevated">
      <div className="p-3 h-full">
        <p className="text-[13px] font-bold leading-tight text-text-primary select-none line-clamp-3">
          {file.title}
        </p>
        {text && (
          <p className="mt-1.5 text-[6px] leading-[1.7] text-text-muted select-none break-words whitespace-pre-line">
            {text}
          </p>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-bg-elevated to-transparent pointer-events-none" />
    </div>
  );
}
