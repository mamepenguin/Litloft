"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { BookX, Maximize, X } from "lucide-react";
import type { FileItem } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { useFullscreen } from "@/components/player/hooks/useFullscreen";
import { useShortcuts } from "@/hooks/useShortcuts";
import { getDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { useEpubReader, type ReaderTheme } from "./useEpubReader";

export const EPUB_READER_URL = "/epub-reader/reader.html";

function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readTheme(): ReaderTheme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export interface EpubPreviewProps {
  file: Pick<FileItem, "id" | "filename" | "title" | "file_size">;
}

export function EpubPreview({ file }: EpubPreviewProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const reader = useEpubReader(file.id, theme);
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const fullscreen = useFullscreen({ frameRef: frameBoxRef, autoRotateEnabled: false });
  const ready = reader.status.kind === "ready";
  const { setFullscreen } = reader;

  useEffect(() => {
    setFullscreen(fullscreen.isFullscreen);
  }, [fullscreen.isFullscreen, setFullscreen]);

  useShortcuts(
    "epub-reader",
    t("epubShortcuts"),
    [
      { key: "pagedown", label: t("epubNextPage"), handler: () => reader.turn("next") },
      { key: "pageup", label: t("epubPreviousPage"), handler: () => reader.turn("prev") },
      { key: "f", label: t("epubFullscreen"), handler: fullscreen.toggle },
    ],
    ready && !fullscreen.isFullscreen,
  );

  // Over everything beneath it while the book fills the screen: the arrows
  // turn pages here instead of moving to another file.
  useShortcuts(
    "epub-reader-fullscreen",
    t("epubShortcuts"),
    [
      { key: "arrowleft", label: t("epubPageLeft"), handler: () => reader.turn("left") },
      { key: "arrowright", label: t("epubPageRight"), handler: () => reader.turn("right") },
      { key: "pagedown", label: t("epubNextPage"), handler: () => reader.turn("next") },
      { key: "pageup", label: t("epubPreviousPage"), handler: () => reader.turn("prev") },
      { key: "f", label: t("epubExitFullscreen"), handler: fullscreen.exit },
      {
        key: "escape",
        label: t("epubExitFullscreen"),
        editingOnly: false,
        handler: fullscreen.exit,
      },
    ],
    fullscreen.isFullscreen,
    OVERLAY_PRIORITY,
    true,
  );

  if (reader.status.kind === "error") {
    return (
      <div className="w-full rounded-xl bg-bg-card">
        <EmptyState
          icon={BookX}
          title={reader.status.code === "unsupported" ? t("epubUnsupported") : t("epubLoadFailed")}
          description={`${file.filename} · ${formatFileSize(file.file_size)}`}
          primaryAction={{ label: tc("download"), href: getDownloadUrl(file.id), download: true }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[60dvh] w-full flex-col md:h-auto md:min-h-[480px]">
      <div
        ref={frameBoxRef}
        data-testid="epub-frame"
        className={[
          "flex flex-col overflow-hidden bg-bg-card",
          fullscreen.isPseudo
            ? "fixed inset-0 z-50 rounded-none"
            : "relative flex-1 rounded-xl",
        ].join(" ")}
      >
        <div
          className="flex shrink-0 items-center justify-end border-b border-bg-border px-2"
          style={
            fullscreen.isPseudo
              ? {
                  // The pinned frame covers the whole screen, notch and
                  // rounded corners included.
                  minHeight: "calc(2.5rem + env(safe-area-inset-top, 0px))",
                  paddingTop: "env(safe-area-inset-top, 0px)",
                  paddingRight: "max(0.5rem, env(safe-area-inset-right, 0px))",
                }
              : { minHeight: "2.5rem" }
          }
        >
          {fullscreen.isFullscreen ? (
            <button
              type="button"
              onClick={fullscreen.exit}
              aria-label={t("epubExitFullscreen")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={fullscreen.toggle}
              disabled={!ready}
              aria-label={t("epubFullscreen")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-elevated disabled:opacity-30"
            >
              <Maximize size={16} />
            </button>
          )}
        </div>
        {/* Absolute rather than h-full: the area's height comes from flex, which
            a percentage height does not resolve against. */}
        <div className="relative min-h-0 flex-1">
          <iframe
            key={file.id}
            ref={reader.frameRef}
            src={EPUB_READER_URL}
            title={t("epubReader", { title: file.title || file.filename })}
            className="absolute inset-0 block h-full w-full border-0"
          />
          {!ready && (
            <p
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-bg-card text-sm text-text-muted"
            >
              {t("epubLoading")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
