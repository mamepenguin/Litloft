import { useEffect, useState, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { NextIntlClientProvider } from "next-intl";

import { FileGrid } from "@/components/FileGrid";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ToastProvider } from "@/components/ToastProvider";
import enMessages from "@/messages-core/en.json";
import type { FileItem } from "@/types";

/**
 * Dimensions cycled through so that lines break at different counts; a run
 * of identical ratios would put the same number of cells on every line and
 * hide a hold that picked "the last N cells" instead of the last line.
 */
const DIMS: [number, number][] = [
  [4000, 3000],
  [3000, 4000],
  [3000, 3000],
  [6000, 3000],
  [3000, 4500],
  [4000, 2250],
];

type Kind = "photo" | "video";

function makeFile(i: number, kind: Kind): FileItem {
  const [w, h] = DIMS[i % DIMS.length];
  const photo = kind === "photo";
  return {
    id: `${kind[0]}${i}`,
    filename: photo ? `shot-${i}.jpg` : `clip-${i}.mp4`,
    title: photo ? `Photo ${i}` : `Clip ${i}`,
    description: "",
    drive: "fixture",
    folder_path: "",
    file_type: photo ? "image" : "video",
    mime_type: photo ? "image/jpeg" : "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: photo ? null : 60,
    image_width: photo ? w : null,
    image_height: photo ? h : null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
  } as FileItem;
}

type More = boolean | "omit";

interface HarnessState {
  files: FileItem[];
  next: number;
  more: More;
  width: number;
  selected: Set<string>;
  tick: number;
}

export interface JustifiedHoldApi {
  append(count: number): void;
  setMore(more: More): void;
  setWidth(px: number): void;
  remove(id: string): void;
  reverse(): void;
  setDims(id: string, w: number, h: number): void;
  select(id: string): void;
  rerender(): void;
  log: string[];
}

declare global {
  interface Window {
    __jg: JustifiedHoldApi;
  }
}

function initial(): HarnessState {
  const q = new URLSearchParams(location.search);
  const n = Number(q.get("n") ?? 40);
  const kind = (q.get("kind") ?? "photo") as Kind;
  const moreParam = q.get("more") ?? "1";
  const more: More = moreParam === "omit" ? "omit" : moreParam === "1";
  return {
    files: Array.from({ length: n }, (_, i) => makeFile(i, kind)),
    next: n,
    more,
    width: Number(q.get("width") ?? 900),
    selected: new Set(),
    tick: 0,
  };
}

/**
 * Every mutation is committed under `flushSync`, so a case can read the DOM
 * the commit left before the browser gets a chance to paint it.
 */
export function JustifiedHoldArrangement(): ReactElement {
  const [state, setState] = useState<HarnessState>(initial);
  const kind = (new URLSearchParams(location.search).get("kind") ?? "photo") as Kind;

  useEffect(() => {
    const log: string[] = [];
    const commit = (fn: (s: HarnessState) => HarnessState) =>
      flushSync(() => setState(fn));
    window.__jg = {
      log,
      append: (count) =>
        commit((s) => ({
          ...s,
          files: [
            ...s.files,
            ...Array.from({ length: count }, (_, i) => makeFile(s.next + i, kind)),
          ],
          next: s.next + count,
        })),
      setMore: (more) => commit((s) => ({ ...s, more })),
      setWidth: (width) => commit((s) => ({ ...s, width })),
      remove: (id) => commit((s) => ({ ...s, files: s.files.filter((f) => f.id !== id) })),
      reverse: () => commit((s) => ({ ...s, files: [...s.files].reverse() })),
      setDims: (id, w, h) =>
        commit((s) => ({
          ...s,
          files: s.files.map((f) =>
            f.id === id ? { ...f, image_width: w, image_height: h } : f,
          ),
        })),
      select: (id) => commit((s) => ({ ...s, selected: new Set([...s.selected, id]) })),
      rerender: () => commit((s) => ({ ...s, tick: s.tick + 1 })),
    };
    document.body.dataset.harness = "ready";
  }, [kind]);

  const moreProp = state.more === "omit" ? {} : { moreMayFollow: state.more };

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <ClipboardProvider>
          <div className="bg-bg-primary p-4" data-tick={state.tick}>
            <button id="before-grid" type="button">
              before
            </button>
            <div id="jg-host" style={{ width: state.width }}>
              <FileGrid
                files={state.files}
                selectable
                selectedIds={state.selected}
                onSelect={(id: string) => window.__jg.log.push(`select:${id}`)}
                onShiftSelect={(id: string) => window.__jg.log.push(`shift:${id}`)}
                {...moreProp}
              />
            </div>
            <button id="after-grid" type="button">
              after
            </button>
          </div>
        </ClipboardProvider>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}
