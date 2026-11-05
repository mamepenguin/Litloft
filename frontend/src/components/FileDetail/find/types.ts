import type { KeyboardEvent } from "react";

import type { FindAnswer, FindRow } from "@/lib/fileFind";

export type FindCategory = "all" | "utterance" | "scene" | "text" | "picture_text";

export type FindStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "notIndexed" }
  | { kind: "noHits" }
  | { kind: "hits"; answer: FindAnswer }
  | { kind: "unavailable" }
  | { kind: "failed" };

export interface FindTabRequest {
  tabId: string;
  seq: number;
}

export type FindReportInstance = "pane" | "sheet";

export interface FindMarksValue {
  /** The answered term, or null when nothing is marked. */
  term: string | null;
  currentRow: FindRow | null;
  rows: FindRow[];
}

export interface FindContextValue {
  enabled: boolean;
  /** The shortcut is registered on this page: enabled, desktop, file surface. */
  shortcutEnabled: boolean;
  open: boolean;
  query: string;
  status: FindStatus;
  filter: FindCategory;
  rows: FindRow[];
  visibleRows: FindRow[];
  currentRow: FindRow | null;
  currentIndex: number | null;
  truncated: boolean;
  focusNonce: number;
  selectRequest: FindTabRequest | null;
  openFind: () => void;
  closeFind: () => void;
  openFindByShortcut: () => boolean;
  changeQuery: (value: string) => void;
  commitQuery: (value: string) => void;
  compositionStart: () => void;
  compositionEnd: () => void;
  keyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  step: (direction: "next" | "prev") => void;
  selectRow: (row: FindRow) => void;
  selectFilter: (category: FindCategory) => void;
  retry: () => void;
  reportTab: (instance: FindReportInstance, tabId: string) => void;
  registerUrlStrip: (fn: (() => void) | null) => void;
}
