"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { BookX, Maximize, X } from "lucide-react";
import type { FileItem } from "@/types";
import { DismissScrim } from "@/components/DismissScrim";
import { EmptyState } from "@/components/EmptyState";
import { useFullscreen } from "@/components/player/hooks/useFullscreen";
import { useAutoHidingChrome } from "@/hooks/useAutoHidingChrome";
import { useFocusScope } from "@/hooks/useFocusScope";
import { useShortcuts } from "@/hooks/useShortcuts";
import { getDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { chapterAt, chapterOf } from "@/lib/epubToc";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { EpubPositionBar } from "./EpubPositionBar";
import { EpubTypographyPanel } from "./EpubTypographyPanel";
import { useEpubReader, type ReaderActivity, type ReaderTheme } from "./useEpubReader";
import { useFillHeight } from "./useFillHeight";

export const EPUB_READER_URL = "/epub-reader/reader.html";

const TOP_BAND = "max(env(safe-area-inset-top, 0px), 3rem)";

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
  /** 1-based section number from `?section=`; read when the reader opens. */
  initialSection?: number | null;
}

export function EpubPreview({ file, initialSection = null }: EpubPreviewProps) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillHeight = useFillHeight(rootRef);
  // Not carried: the carry animates the frame's box, and the reader inside it
  // reflows to every intermediate size, which reads as the frame sliding off.
  const fullscreen = useFullscreen({
    frameRef: frameBoxRef,
    autoRotateEnabled: false,
    animate: false,
  });
  const [scrubbing, setScrubbing] = useState(false);
  const [typographyOpen, setTypographyOpen] = useState(false);
  const typographyPanelRef = useRef<HTMLDivElement | null>(null);
  const chrome = useAutoHidingChrome({
    enabled: fullscreen.isFullscreen,
    held: scrubbing || typographyOpen,
  });
  const { show: showChrome, toggle: toggleChrome } = chrome;
  // Pointer and key activity inside the book never reaches this document.
  const onActivity = useCallback(
    (kind: ReaderActivity) => (kind === "tap" ? toggleChrome() : showChrome()),
    [showChrome, toggleChrome],
  );
  const reader = useEpubReader(file.id, theme, onActivity, initialSection);
  const ready = reader.status.kind === "ready";
  const { setFullscreen, book, location, seeking } = reader;
  const toc = book?.toc ?? null;
  const labelAt = useCallback((f: number) => (toc ? chapterAt(toc, f) : null), [toc]);
  // While a seek is under way the bar shows where it is going, not the
  // pages the reader passes through on the way.
  const place = seeking ?? location?.fraction ?? null;
  const chapter =
    seeking !== null ? labelAt(seeking) : toc && location ? chapterOf(toc, location) : null;
  const pagesLeft = seeking !== null ? null : (location?.pagesLeft ?? null);
  const focusBook = useCallback(() => reader.frameRef.current?.contentWindow?.focus(), [reader.frameRef]);

  const closeTypography = useCallback(() => {
    setTypographyOpen(false);
    focusBook();
  }, [focusBook]);
  const toggleTypography = useCallback(() => {
    if (typographyOpen) closeTypography();
    else setTypographyOpen(true);
  }, [typographyOpen, closeTypography]);

  useEffect(() => {
    if (typographyOpen) typographyPanelRef.current?.focus();
  }, [typographyOpen]);

  // The panel belongs to one mode's bar; any way in or out of full screen
  // closes it.
  useEffect(() => {
    setTypographyOpen(false);
  }, [fullscreen.isFullscreen]);

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

  // Scoped, unlike the keys above: a focused tab strip owns the arrows, and
  // the provider fires every match whether or not the strip handled the key.
  const inScope = useFocusScope(rootRef);
  useShortcuts(
    "epub-reader-arrows",
    t("epubShortcuts"),
    [
      { key: "arrowleft", label: t("epubPageLeft"), handler: () => reader.turn("left") },
      { key: "arrowright", label: t("epubPageRight"), handler: () => reader.turn("right") },
    ],
    ready && !fullscreen.isFullscreen && inScope,
  );

  // Over everything beneath it while the book fills the screen.
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

  // The full screen's tier, not a higher one: a search or a note opened over
  // the panel keeps its own Escape. Enabled later, so it wins within the tier.
  useShortcuts(
    "epub-typography",
    t("epubTypography"),
    [
      {
        key: "escape",
        label: t("epubCloseTypography"),
        editingOnly: false,
        handler: closeTypography,
      },
    ],
    typographyOpen,
    OVERLAY_PRIORITY,
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
    <div
      ref={rootRef}
      data-epub-reader
      className="flex w-full flex-col"
      style={{ height: fillHeight ?? "60dvh" }}
    >
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
        <div className="relative min-h-0 flex-1">
          {/* Absolute rather than h-full: the box's height comes from flex, which
              a percentage height does not resolve against. */}
          <div
            className="absolute inset-0"
            style={
              fullscreen.isPseudo
                ? {
                    // Pinned over the whole screen: the book stays inside the
                    // safe area, and the band above it holds the close button.
                    top: TOP_BAND,
                    bottom: "env(safe-area-inset-bottom, 0px)",
                    left: "env(safe-area-inset-left, 0px)",
                    right: "env(safe-area-inset-right, 0px)",
                  }
                : undefined
            }
          >
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
            {typographyOpen && (
              // Over the book too: the book is a frame whose presses never
              // reach this page.
              <DismissScrim
                onDismiss={closeTypography}
                label={t("epubCloseTypography")}
                className="absolute inset-0 z-10 cursor-default"
                data-testid="epub-typography-cover"
              >
                <div
                  data-swipe-exempt
                  className="absolute inset-x-2 top-2 z-20 flex flex-col justify-end"
                  style={{
                    bottom: fullscreen.isFullscreen ? "calc(2.5rem + 0.5rem)" : "0.5rem",
                  }}
                >
                  <EpubTypographyPanel
                    ref={typographyPanelRef}
                    typography={reader.typography}
                    onChange={reader.setTypography}
                  />
                </div>
              </DismissScrim>
            )}
          </div>
        </div>
        {fullscreen.isFullscreen ? (
          <>
            <div
              data-testid="epub-chrome-top"
              className="absolute inset-x-0 top-0 flex items-center bg-bg-card/95 pl-4 pr-12 transition-opacity duration-300"
              {...chrome.chromeProps}
              style={{ height: fullscreen.isPseudo ? TOP_BAND : "3rem", ...chrome.chromeProps.style }}
            >
              <span className="min-w-0 truncate text-sm text-text-muted">{chapter}</span>
            </div>
            <div
              data-testid="epub-chrome-bottom"
              className="absolute inset-x-0 bottom-0 border-t border-bg-border bg-bg-card/95 transition-opacity duration-300"
              {...chrome.chromeProps}
              style={{
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                paddingLeft: "env(safe-area-inset-left, 0px)",
                paddingRight: "env(safe-area-inset-right, 0px)",
                ...chrome.chromeProps.style,
              }}
            >
              <EpubPositionBar
                key={file.id}
                className="h-10"
                fraction={place}
                chapter={chapter}
                pagesLeft={pagesLeft}
                dir={book?.dir ?? "ltr"}
                chapterAt={labelAt}
                onSeek={reader.seek}
                onTurn={reader.turn}
                onPointerCommit={focusBook}
                onScrubbingChange={setScrubbing}
                typographyOpen={typographyOpen}
                onToggleTypography={toggleTypography}
              />
            </div>
          </>
        ) : (
          <EpubPositionBar
            key={file.id}
            className="h-10 shrink-0 border-t border-bg-border"
            fraction={place}
            chapter={chapter}
            pagesLeft={pagesLeft}
            dir={book?.dir ?? "ltr"}
            chapterAt={labelAt}
            onSeek={reader.seek}
            onTurn={reader.turn}
            onPointerCommit={focusBook}
            onScrubbingChange={setScrubbing}
            typographyOpen={typographyOpen}
            onToggleTypography={toggleTypography}
          />
        )}
        <button
          type="button"
          onClick={fullscreen.isFullscreen ? fullscreen.exit : fullscreen.toggle}
          disabled={!ready}
          aria-label={fullscreen.isFullscreen ? t("epubExitFullscreen") : t("epubFullscreen")}
          className="absolute z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-bg-card/80 text-text-muted hover:bg-bg-elevated disabled:opacity-30"
          style={
            fullscreen.isPseudo
              ? {
                  // Straddling the band's lower edge.
                  top: `calc(${TOP_BAND} - 1.5rem)`,
                  right: "max(0.5rem, env(safe-area-inset-right, 0px))",
                }
              : { top: "0.5rem", right: "0.5rem" }
          }
        >
          {fullscreen.isFullscreen ? <X size={16} /> : <Maximize size={16} />}
        </button>
      </div>
    </div>
  );
}
