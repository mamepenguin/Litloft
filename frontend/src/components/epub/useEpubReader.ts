"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getStreamUrl } from "@/lib/api";
import { useEpubProgress } from "@/lib/epubProgress";
import {
  parseReaderMessage,
  postToReader,
  type ReaderCommand,
} from "@/lib/epubReaderChannel";

export type ReaderTheme = "light" | "dark";
export type TurnDirection = Extract<ReaderCommand, { type: "turn" }>["direction"];

export type ReaderStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; code: "unsupported" | "parse" | "isolation" | "fetch" };

export interface EpubReader {
  frameRef: RefObject<HTMLIFrameElement | null>;
  status: ReaderStatus;
  turn: (direction: TurnDirection) => void;
  setFullscreen: (fullscreen: boolean) => void;
}

async function fetchBook(fileId: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(getStreamUrl(fileId), { credentials: "include", signal });
  if (!res.ok) throw new Error(`stream ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Keys the reader hands back are replayed on this document, so the page's
 * own shortcut stack decides what they mean here — the previous or next
 * file inline, closing full screen.
 */
function replayKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

export function useEpubReader(fileId: string, theme: ReaderTheme): EpubReader {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<ReaderStatus>({ kind: "loading" });
  const { readSaved, turned } = useEpubProgress(fileId);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const bookRef = useRef<Promise<[ArrayBuffer, number | null]> | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const book = Promise.all([fetchBook(fileId, controller.signal), readSaved()]);
    // Settled here so an abort on unmount is not an unhandled rejection.
    book.catch(() => {});
    bookRef.current = book;
    openedRef.current = false;
    setStatus({ kind: "loading" });
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
              postToReader(
                readerWindow,
                { type: "open", bytes, fraction, theme: themeRef.current },
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
          setStatus({ kind: "ready" });
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

  const setFullscreen = useCallback((fullscreen: boolean) => {
    const readerWindow = frameRef.current?.contentWindow ?? null;
    postToReader(readerWindow, { type: "mode", fullscreen });
    if (fullscreen) readerWindow?.focus();
  }, []);

  return { frameRef, status, turn, setFullscreen };
}
