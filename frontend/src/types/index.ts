export type FileType = "video" | "image" | "audio" | "document" | "archive" | "subtitle" | "other";

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
  likes: number;
  is_favorite: boolean;
  tags: string[];
  subtitles: SubtitleInfo[];
  deleted_at: string | null;
  missing_since: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Set only on the backend search path. Indicates whether the query matched
   * the title, folder_path, or both. `searchMerge.ts` routes this to the
   * filename vs path badge. `null` on non-search paths.
   * Spec `2026-05-02-search-path-match.md`.
   */
  match_source?: "filename" | "path" | "both" | null;
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
}

export interface UnlockResult {
  success: boolean;
  groups?: string[];
  error?: string;
}

export interface AuthStatus {
  unlocked_groups: string[];
  has_protected_drives: boolean;
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

export type TreeTypeFilter = "markdown" | "video" | "image" | "pdf";

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
}

export interface PlaylistSummary {
  id: string;
  name: string;
  drive: string;
  item_count: number;
  first_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaylistItemEntry {
  id: number;
  position: number;
  file: FileItem;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  drive: string;
  items: PlaylistItemEntry[];
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
  | "likes"
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
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  file_count: number;
  file_types: Record<string, number>;
  last_scanned_at: string | null;
  is_scanning: boolean;
  readonly: boolean;
}

export interface DashboardSystemInfo {
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
