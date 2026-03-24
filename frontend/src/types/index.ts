export interface Video {
  id: number;
  filename: string;
  title: string;
  description: string;
  drive: string;
  folder_path: string;
  thumbnail_url: string;
  file_size: number;
  duration: number | null;
  likes: number;
  dislikes: number;
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
  data: Video[];
  meta: PaginationMeta;
}

export interface Drive {
  name: string;
}

export interface Folder {
  name: string;
  path: string;
  video_count: number;
}

export interface Tag {
  name: string;
  count: number;
}

export type ViewMode = "grid" | "list";
export type SortField = "created_at" | "title" | "file_size";
export type SortOrder = "asc" | "desc";
