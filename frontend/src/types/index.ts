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

export interface Folder {
  name: string;
  path: string;
  file_count: number;
  thumbnail_file_id: string | null;
}

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
export type SortField = "created_at" | "title" | "file_size" | "likes" | "random";
export type SortOrder = "asc" | "desc";

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
