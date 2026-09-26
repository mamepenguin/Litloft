"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getStreamUrl } from "@/lib/api";
import { useEpubProgress } from "@/lib/epubProgress";
import {
  readStoredTypography,
  writeStoredTypography,
  type Typography,
} from "@/lib/epubTypography";
import {
  parseReaderMessage,
  postToReader,
  type ReaderCommand,
  type ReaderMessage,
  type TocEntry,
} from "@/lib/epubReaderChannel";

export type ReaderTheme = "light" | "dark";
export type TurnDirection = Extract<ReaderCommand, { type: "turn" }>["direction"];

export type ReaderLocation = Omit<Extract<ReaderMessage, { type: "location" }>, "type">;
export type ReaderActivity = Extract<ReaderMessage, { type: "activity" }>["kind"];

export interface ReaderBook {
  dir: "ltr" | "rtl";
  toc: TocEntry[];
}

export type ReaderStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; code: "unsupported" | "parse" | "isolation" | "fetch" };

export interface EpubReader {
  frameRef: RefObject<HTMLIFrameElement | null>;
  status: ReaderStatus;
  /** Set once the book is open. */
  book: ReaderBook | null;
  /** Null until the book is open and has laid out its first page. */
  location: ReaderLocation | null;
  /** Where the last seek is going, until the reader answers it. */
  seeking: number | null;
  turn: (direction: TurnDirection) => void;
  seek: (fraction: number) => void;
  typography: Typography;
  setTypography: (typography: Typography) => void;
  setFullscreen: (fullscreen: boolean) => void;
}

async function fetchBook(fileId: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(getStreamUrl(fileId), { credentials: "include", signal });
  if (!res.ok) throw new Error(`stream ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Keys the reader hands back are replayed on this document, so the page's
 * own shortcut stack decides what they mean here.
 */
function replayKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

export function useEpubReader(
  fileId: string,
  theme: ReaderTheme,
  onActivity?: (kind: ReaderActivity) => void,
  initialSection: number | null = null,
): EpubReader {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<ReaderStatus>({ kind: "loading" });
  const [book, setBook] = useState<ReaderBook | null>(null);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [seeking, setSeeking] = useState<{ id: number; fraction: number } | null>(null);
  const seekIdRef = useRef(0);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const { readSaved, turned } = useEpubProgress(fileId);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const initialSectionRef = useRef(initialSection);
  initialSectionRef.current = initialSection;
  const [typography, setTypographyState] = useState<Typography>(readStoredTypography);
  const typographyRef = useRef(typography);
  typographyRef.current = typography;
  const bookRef = useRef<Promise<[ArrayBuffer, number | null]> | null>(null);
  const openedRef = useRef(false);
  const readyRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const book = Promise.all([fetchBook(fileId, controller.signal), readSaved()]);
    // Settled here so an abort on unmount is not an unhandled rejection.
    book.catch(() => {});
    bookRef.current = book;
    openedRef.current = false;
    readyRef.current = false;
    setStatus({ kind: "loading" });
    setBook(null);
    setLocation(null);
    setSeeking(null);
    return () => {
      controller.abort();
      bookRef.current = null;
    };
  }, [fileId, readSaved]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const readerWindow = frameRef.current?.contentWindow ?? null;
      const message = parseReaderMessage(event, readerWindow);
      if (!message) return;
      switch (message.type) {
        case "boot": {
          const book = bookRef.current;
          if (!book || openedRef.current) return;
          openedRef.current = true;
          book.then(
            ([bytes, fraction]) => {
              if (bookRef.current !== book) return;
              const n = initialSectionRef.current;
              const section = n !== null && Number.isInteger(n) && n >= 1 ? n - 1 : null;
              postToReader(
                readerWindow,
                {
                  type: "open",
                  bytes,
                  fraction,
                  section,
                  theme: themeRef.current,
                  typography: typographyRef.current,
                },
                [bytes],
              );
            },
            () => {
              if (bookRef.current === book) setStatus({ kind: "error", code: "fetch" });
            },
          );
          return;
        }
        case "ready":
          readyRef.current = true;
          setBook({ dir: message.dir, toc: message.toc });
          setStatus({ kind: "ready" });
          return;
        case "location": {
          if (!readyRef.current) return;
          const { fraction, tocIndex, pagesLeft } = message;
          setLocation({ fraction, tocIndex, pagesLeft });
          return;
        }
        case "seeked": {
          const { id } = message;
          setSeeking((current) => (current?.id === id ? null : current));
          return;
        }
        case "activity":
          onActivityRef.current?.(message.kind);
          return;
        case "turned":
          turned(message.fraction, message.atEnd);
          return;
        case "key":
          replayKey(message.key);
          return;
        case "link":
          window.open(message.url, "_blank", "noopener,noreferrer");
          return;
        case "error":
          setStatus({ kind: "error", code: message.code });
          return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [turned]);

  useEffect(() => {
    if (status.kind !== "ready") return;
    postToReader(frameRef.current?.contentWindow ?? null, { type: "theme", theme });
  }, [theme, status.kind]);

  const turn = useCallback((direction: TurnDirection) => {
    postToReader(frameRef.current?.contentWindow ?? null, { type: "turn", direction });
  }, []);

  const seek = useCallback((fraction: number) => {
    const id = ++seekIdRef.current;
    setSeeking({ id, fraction });
    postToReader(frameRef.current?.contentWindow ?? null, { type: "seek", fraction, id });
  }, []);

  const setTypography = useCallback((next: Typography) => {
    setTypographyState(next);
    writeStoredTypography(next);
    if (readyRef.current)
      postToReader(frameRef.current?.contentWindow ?? null, { type: "typography", typography: next });
  }, []);

  const setFullscreen = useCallback((fullscreen: boolean) => {
    const readerWindow = frameRef.current?.contentWindow ?? null;
    postToReader(readerWindow, { type: "mode", fullscreen });
    if (fullscreen) readerWindow?.focus();
  }, []);

  return {
    frameRef,
    status,
    book,
    location,
    seeking: seeking?.fraction ?? null,
    turn,
    seek,
    typography,
    setTypography,
    setFullscreen,
  };
}
