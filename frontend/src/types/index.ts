export type FileType = "video" | "image" | "audio" | "document" | "archive" | "other";

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
  file_size: number;
  duration: number | null;
  likes: number;
  is_favorite: boolean;
  tags: string[];
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
