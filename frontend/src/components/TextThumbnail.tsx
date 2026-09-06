"use client";

import { useEffect, useRef, useState } from "react";
import type { FileItem } from "@/types";
import { getPreviewTextUrl } from "@/lib/api";
import { OFFICE_MIMES } from "@/lib/officeFiles";



/**
 * How much of the file to read for the preview.
 *
 * A web clip's frontmatter is `---`, `id:`, `url:`, `origin:`,
 * `created:`, `---` — about 80 bytes plus the source URL, so its size
 * is really the URL's. The old 400-byte window held a 227-character URL
 * and not a 327-character one, and past that boundary the strip below
 * matched nothing and the card showed the metadata instead of the note.
 * A kilobyte covers a ~950-character URL, and the card draws three
 * lines whatever it is handed, so the extra bytes cost nothing.
 */
const PREVIEW_WINDOW_BYTES = 1024;

/**
 * The document's own opening, as a 6px card can show it.
 *
 * What comes off are the things every clipped note has in common —
 * frontmatter, the hero image, the source URL on its own line — because
 * a shape that is identical on every card is not a shape. Prose that
 * merely contains a link keeps its words.
 */
export function stripPreviewText(raw: string): string {
  const closed = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.test(raw);
  // Opened but never closed inside the window: everything fetched is
  // frontmatter. Showing the fragment would put `id:` and `url:` on the
  // card, so show nothing and let the title stand alone. The `key:
  // value` test is what separates that from a note that simply opens on
  // a horizontal rule — which is rare, but would otherwise go blank.
  const truncatedFrontmatter =
    !closed && /^---\r?\n[ \t]*[A-Za-z][\w-]*:[ \t]/.test(raw);
  const body = closed
    ? raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    : truncatedFrontmatter
      ? ""
      : raw;

  return body
    .replace(/<[^>]+>/g, "")
    .replace(/^#+ /gm, "")
    // An image is not text; a line that is only an image is not a line.
    .replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, "")
    // A link's words are prose and stay; its target is not.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // A line that is nothing but a URL — the clipper's source line.
    .replace(/^[ \t]*<?https?:\/\/\S+>?[ \t]*$/gm, "")
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
            ? fetch(getPreviewTextUrl(file.id))
            : fetch(`/api/files/${file.id}/stream`, {
                headers: { Range: `bytes=0-${PREVIEW_WINDOW_BYTES - 1}` },
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
    <div
      ref={containerRef}
      data-testid="text-thumbnail"
      className="h-full w-full relative overflow-hidden bg-bg-elevated"
    >
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
