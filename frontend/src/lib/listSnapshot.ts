"use client";

import type { FileItem, FileKind, Folder, SortField, SortOrder, ViewMode } from "@/types";

const STORAGE_KEY = "hv_list_snapshot";
const TTL_MS = 2 * 60 * 60 * 1000;

export interface ListSnapshotFilters {
  sort: SortField;
  order: SortOrder;
  typeFilter: FileKind | null;
  viewMode: ViewMode;
}

export interface ListSnapshot {
  key: string;
  scrollY: number;
  pagesLoaded: number;
  items: FileItem[];
  total: number;
  folders: Folder[];
  filters: ListSnapshotFilters;
  ts: number;
}

export interface ListSnapshotKeyParts {
  driveName: string;
  folderPath?: string;
  view?: string | null;
  tagFilter?: string | null;
}

export function buildListSnapshotKey(parts: ListSnapshotKeyParts): string {
  return [
    parts.driveName,
    parts.folderPath ?? "",
    parts.view ?? "",
    parts.tagFilter ?? "",
  ].join("|");
}

// Deliberately narrower than ``lib/sortField``: a snapshot is never taken
// in search mode, so ``relevance`` must not validate here.
const SORT_FIELDS: readonly SortField[] = ["created_at", "title", "file_size", "random"];
const SORT_ORDERS: readonly SortOrder[] = ["asc", "desc"];
const VIEW_MODES: readonly ViewMode[] = ["grid", "list"];
// A snapshot is restored into the toolbar's filter, so what it may
// carry is exactly what the toolbar can hold. `subtitle` is not one of
// them: it is a `file_type` no listing offers.
const FILE_KINDS: readonly FileKind[] = [
  "video", "image", "audio", "document", "archive", "other", "markdown", "pdf",
];

function isValidSnapshot(value: unknown): value is ListSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== "string") return false;
  if (typeof v.scrollY !== "number" || !Number.isFinite(v.scrollY)) return false;
  if (typeof v.pagesLoaded !== "number" || !Number.isFinite(v.pagesLoaded)) return false;
  if (typeof v.total !== "number" || !Number.isFinite(v.total)) return false;
  if (typeof v.ts !== "number" || !Number.isFinite(v.ts)) return false;
  if (!Array.isArray(v.items)) return false;
  if (!Array.isArray(v.folders)) return false;
  const filters = v.filters as Record<string, unknown> | null | undefined;
  if (!filters || typeof filters !== "object") return false;
  if (!SORT_FIELDS.includes(filters.sort as SortField)) return false;
  if (!SORT_ORDERS.includes(filters.order as SortOrder)) return false;
  if (!VIEW_MODES.includes(filters.viewMode as ViewMode)) return false;
  if (filters.typeFilter !== null && !FILE_KINDS.includes(filters.typeFilter as FileKind)) return false;
  return true;
}

export function loadListSnapshot(key: string): ListSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSnapshot(parsed)) {
      // Unknown or stale shape (e.g. schema change, manual edit) — evict.
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (parsed.key !== key) return null;
    if (Date.now() - parsed.ts > TTL_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveListSnapshot(snapshot: Omit<ListSnapshot, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ListSnapshot = { ...snapshot, ts: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or serialization errors are non-fatal: restoration is a progressive
    // enhancement and the next navigation will simply fall back to a fresh fetch.
  }
}

export function clearListSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
