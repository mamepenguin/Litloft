/**
 * Wire shapes and timestamps shared by the inbox page's acceptance files.
 * Timestamps are built from local components so "today" and "yesterday"
 * mean what the viewer's clock says, whatever timezone CI runs in.
 */

import type { ProcessingStage } from "@/lib/api";

export interface InboxFileWire {
  id: string;
  filename: string;
  title: string;
  description: string;
  drive: string;
  folder_path: string;
  file_type: "video" | "image" | "audio" | "document" | "archive" | "other";
  mime_type: string;
  thumbnail_url: string;
  has_thumbnail: boolean;
  file_size: number;
  duration: number | null;
  liked_at: string | null;
  is_favorite: boolean;
  tags: string[];
  subtitles: never[];
  deleted_at: string | null;
  missing_since: string | null;
  trust_tier: "verified";
  trust_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  image_width: number | null;
  image_height: number | null;
}

export interface InboxItemWire {
  file: InboxFileWire;
  arrived_at: string;
  source: string;
  source_i18n_key: string;
}

export function inboxFile(
  id: string,
  overrides: Partial<InboxFileWire> = {},
): InboxFileWire {
  return {
    id,
    filename: `Arrival ${id}`,
    title: `Arrival ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 60,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    image_width: null,
    image_height: null,
    ...overrides,
  };
}

/** The wire's `YYYY-MM-DDTHH:MM:SS.ffffffZ`. */
function wireTime(date: Date): string {
  return `${date.toISOString().slice(0, 19)}.000000Z`;
}

/** A local wall-clock moment, `daysAgo` days back, at `hh:mm` local. */
export function localMoment(daysAgo: number, hh: number, mm: number): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysAgo,
    hh,
    mm,
    0,
    0,
  );
}

export function arrivedAt(date: Date): string {
  return wireTime(date);
}

export function clockOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function inboxItem(
  file: InboxFileWire,
  when: Date,
  source = "upload",
  sourceI18nKey = "inbox.sourceUpload",
): InboxItemWire {
  return {
    file,
    arrived_at: arrivedAt(when),
    source,
    source_i18n_key: sourceI18nKey,
  };
}

export function stage(
  key: string,
  state: "pending" | "running" | "done" | "failed" | "unavailable",
  {
    required = true,
    i18nKey = `upload.${key}`,
  }: { required?: boolean; i18nKey?: string } = {},
): ProcessingStage {
  // The core reports an unreachable addon as a stage keyed "unavailable"
  // whose state stays "pending".
  if (state === "unavailable") {
    return {
      addon: key,
      key: "unavailable",
      i18n_key: i18nKey,
      state: "pending",
      required,
    };
  }
  return {
    addon: null,
    key,
    i18n_key: i18nKey,
    state,
    required,
  };
}
