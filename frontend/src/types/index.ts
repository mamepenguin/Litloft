export type FileType = "video" | "image" | "audio" | "document" | "archive" | "subtitle" | "other";

export type TrustTier = "verified" | "unverified";

/**
 * Listing filter. `unreviewed` is deliberately not a tier: it selects
 * files nobody has ruled on, which spans both tiers because the migrated
 * backlog is verified but unjudged.
 */
export type TrustFilter = TrustTier | "unreviewed";

export interface SubtitleInfo {
  index: number;
  language: string;
  format: string;
  label: string;
}

export interface FileItem {
  id: string;
  filename: string;
  title: string;
  description: string;
  drive: string;
  folder_path: string;
  file_type: FileType;
  mime_type: string;
  thumbnail_url: string;
  has_thumbnail: boolean;
  file_size: number;
  duration: number | null;
  /**
   * Pixel dimensions of the source image, for laying a listing out at the
   * real aspect ratio. Null for everything that is not an image — including
   * video, whose thumbnail is letterboxed to 320x180 so the true ratio has
   * nowhere to show. Spec `2026-09-06-ui-redesign-p4-viewers.md`.
   */
  image_width: number | null;
  image_height: number | null;
  liked_at: string | null;
  is_favorite: boolean;
  tags: string[];
  subtitles: SubtitleInfo[];
  deleted_at: string | null;
  missing_since: string | null;
  /**
   * Whether the viewer has vouched for this file as a source. Unverified
   * files stay searchable but stop grounding Ask answers.
   *
   * Read together with `trust_reviewed_at`: the two encode four states, and
   * `verified` with a null stamp means "bulk-migrated or declared by an
   * addon at ingest", not "a person approved this".
   * Spec `2026-08-29-web-clip-promotion.md`.
   */
  trust_tier: TrustTier;
  trust_reviewed_at: string | null;
  /**
   * Client-only marker set by the search-merge placeholder builder when
   * core's bulk hydrate failed and the real tier is unknown. Never sent
   * by the API. A trust filter drops these rather than letting an
   * unknown pass as verified.
   */
  trust_unknown?: true;
  created_at: string;
  updated_at: string;
  /**
   * Set only on the backend search path. Indicates whether the query matched
   * the title, folder_path, or both. `searchMerge.ts` routes this to the
   * filename vs path badge. `null` on non-search paths.
   * Spec `2026-05-02-search-path-match.md`.
   */
  match_source?: "filename" | "path" | "both" | null;
  /**
   * Whether the file has chapters, answered inline by the detail endpoint
   * so the companion layout can be decided from data already in hand. The
   * list itself comes from `getFileChapters`. Absent on list endpoints,
   * which return the plain file shape.
   * Spec `2026-08-11-media-chapters.md` §5.
   */
  has_chapters?: boolean;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedResponse {
  data: FileItem[];
  meta: PaginationMeta;
}

export interface Drive {
  name: string;
  protected: boolean;
  // Active file count (trash/missing excluded). Always returned by
  // GET /api/drives (DriveResponse default 0).
  file_count: number;
}

export interface UnlockResult {
  success: boolean;
  groups?: string[];
  error?: string;
}

export interface AuthStatus {
  unlocked_groups: string[];
  has_protected_drives: boolean;
  // True iff the viewer can see every protected drive (the same
  // admin definition the /admin gate uses). Gates the sidebar
  // dashboard link.
  is_admin: boolean;
}

export type FolderKind =
  | "markdown"
  | "video"
  | "image"
  | "pdf"
  | "audio"
  | "document"
  | "other";

export interface Folder {
  name: string;
  path: string;
  file_count: number;
  thumbnail_file_id: string | null;
  dominant_kind: FolderKind | null;
}

/**
 * The one vocabulary for "what kind of file is this", mirroring
 * `FileKind` in `backend/app/routers/drives.py`.
 *
 * It is `FileType` with two refinements nested under `document`:
 * markdown and PDF are documents, and asking for documents returns
 * them. `subtitle` is a real `file_type` but no surface offers it.
 *
 * The classifier lives in the backend and only there — a second
 * implementation that agreed the day it was written is what put the
 * same file on opposite sides of the listing and the tree.
 */
export type FileKind =
  | "video"
  | "image"
  | "audio"
  | "document"
  | "archive"
  | "other"
  | "markdown"
  | "pdf";

export type FolderTreeNode =
  | {
      kind: "folder";
      name: string;
      path: string;
      file_count: number;
      has_children: boolean;
    }
  | {
      kind: "file";
      name: string;
      path: string;
      file_id: string;
      file_type: FileType;
      mime_type: string;
    };

export interface Tag {
  name: string;
  count: number;
}

export interface PinnedFolder {
  path: string;
}

export interface Neighbors {
  prev_id: string | null;
  next_id: string | null;
  /**
   * 1-origin place of the file in its folder's ordering, for an `n / N`
   * readout. Null when the sort key cannot order it (an unliked file under
   * `sort=liked_at`); `total` still counts the folder in that case.
   */
  position: number | null;
  total: number;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  drive: string;
  item_count: number;
  first_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionItemEntry {
  id: number;
  position: number;
  file: FileItem;
}

export interface CollectionDetail {
  id: string;
  name: string;
  description: string | null;
  drive: string;
  items: CollectionItemEntry[];
  created_at: string;
  updated_at: string;
}

export interface ArchiveEntry {
  path: string;
  filename: string;
  file_size: number;
  compressed_size: number;
  file_type: string;
  mime_type: string;
  is_dir: boolean;
}

export interface ArchiveContents {
  entries: ArchiveEntry[];
  total_entries: number;
  total_size: number;
}

export type ViewMode = "grid" | "list";
export type SortField =
  | "created_at"
  | "title"
  | "file_size"
  // Only the Liked view selects this. It is deliberately absent from
  // SortButton's options: inside an ordinary folder most rows have no
  // value at all.
  | "liked_at"
  | "random"
  | "relevance";
export type SortOrder = "asc" | "desc";

/**
 * Per-file match metadata in the unified search results list.
 *
 * Phase 3 (`2026-05-02-search-results-unification-phase3.md`) folds
 * filename match and semantic results into one list; each card carries
 * the engines that hit alongside the FileItem. Engines are independent
 * — multiple may be set for a single file ("filename + transcript +
 * clip" is a stronger result than any one alone).
 */
export interface MatchTimestamp {
  time_range: [number, number];
  score: number;
  text?: string;
}

export interface MatchContent {
  score: number;
  text?: string;
  page?: number;
}

export interface MatchMeta {
  /** Filename / metadata search hit (backend has no real score, set to 1). */
  filename?: { score: number };
  /**
   * Folder-path substring match from the filename engine. Carried as a
   * separate channel so the card can label "パス" distinctly from
   * "ファイル名" — both can be set when the query hits both fields.
   * Hybrid score weight is intentionally low (0.3) to keep noise from
   * broad-folder matches like "/Music/" out of the top ranks. Spec
   * `2026-05-02-search-path-match.md`.
   */
  path?: { score: number };
  /**
   * Audio bucket — collapses whisper / transcript / transcript_keyword
   * into a single channel so the card shows one "音声" badge instead
   * of stacking semantic + keyword variants.
   */
  transcript?: MatchTimestamp[];
  /** Scene-frame CLIP matches (time-ranged). */
  clip?: MatchTimestamp[];
  /**
   * Representative-frame CLIP match (one per file, no timestamp).
   * Distinct from ``clip`` so the UI can label "video about X"
   * (thumbnail) vs. "scene with X" (scene CLIP) separately. Spec
   * `2026-05-02-thumbnail-clip-default-shallow-search.md`.
   */
  clip_thumbnail?: { score: number };
  /** Metadata embedding hit (filename + title + description + tags). */
  metadata?: { score: number };
  /**
   * Long-form text content bucket — collapses semantic text_content
   * and text_content_keyword (FTS5) hits.
   */
  content?: { score: number };
  /** Body excerpts, retaining the page association of each document hit. */
  content_matches?: MatchContent[];
  /**
   * SIRA-style LLM-expanded retrieval keywords hit (fts_retrieval_keywords).
   * Chip-only badge: the keyword expansion does NOT point at a body
   * location, so the result item shows the chip but jumps using
   * whichever other channel produced a real timestamp / page.
   * ``matched`` holds the expanded keyword string(s) for future UI use
   * (Phase 2.5+ tooltip / inline display). Spec
   * docs/superpowers/specs/2026-05-14-sira-retrieval-keywords.md.
   */
  retrieval_keywords?: { score: number; matched?: string[] };
  /** Page references for paginated documents (PDF). */
  matched_pages?: number[];
}

export interface FileItemWithMatch extends FileItem {
  match_meta?: MatchMeta;
  /** Hybrid score for sorting by relevance. Higher = better. */
  match_score?: number;
}

export interface UploadInitResponse {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
}

export interface ChunkResponse {
  chunk_index: number;
  received_chunks: number;
  total_chunks: number;
}

export interface WatchProgress {
  position: number;
  duration: number;
}

export interface WatchHistoryItem extends FileItem {
  watch_progress: WatchProgress;
}

export interface BatchRenameRequest {
  ids: string[];
  mode: "template" | "regex" | "prefix_suffix";
  template?: string;
  start_number?: number;
  zero_pad?: number;
  pattern?: string;
  replacement?: string;
  action?: "add_prefix" | "add_suffix" | "remove_prefix" | "remove_suffix";
  value?: string;
}

export interface BatchRenameResult {
  id: string;
  old_name: string;
  new_name: string;
}

export interface BatchRenameResponse {
  renamed: number;
  results: BatchRenameResult[];
}

export interface WebSocketEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface ScanProgressData {
  drive: string;
  added: number;
  total: number;
}

export interface ScanCompleteData {
  drive: string;
  added: number;
  missing: number;
  recovered: number;
  updated: number;
  total: number;
}

export interface UploadCompleteData {
  drive: string;
  file_id: string;
  filename: string;
}

export interface DashboardDriveInfo {
  name: string;
  file_count: number;
  file_types: Record<string, number>;
  last_scanned_at: string | null;
  is_scanning: boolean;
  readonly: boolean;
}

/** One mounted filesystem, and the drives that share it. */
export interface DashboardFilesystemInfo {
  mount_label: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  drives: string[];
}

export interface DashboardSystemInfo {
  filesystems: DashboardFilesystemInfo[];
  db_size_bytes: number;
  thumbnail_cache_bytes: number;
  converted_cache_bytes: number;
  upload_temp_bytes: number;
  total_files: number;
  trash_count: number;
  missing_count: number;
  uptime_seconds: number;
}

export interface DriveSummary {
  name: string;
  trash_count: number;
  missing_count: number;
}

export interface DashboardResponse {
  drives: DashboardDriveInfo[];
  system: DashboardSystemInfo;
}

export interface DuplicateGroup {
  hash: string;
  total_size: number;
  files: FileItem[];
}

export interface DuplicatesResponse {
  groups: DuplicateGroup[];
  total_groups: number;
  total_wasted_bytes: number;
}

export interface Comment {
  id: string;
  nickname: string | null;
  body: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommentsResponse {
  comments: Comment[];
  total: number;
}

export interface FileExif {
  datetime_original: string | null;
  make: string | null;
  model: string | null;
  f_number: number | null;
  exposure_time: string | null;
  iso_speed: number | null;
  focal_length: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
}
