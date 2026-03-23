export interface Video {
  id: number;
  filename: string;
  title: string;
  description: string;
  category: string;
  thumbnail_url: string;
  file_size: number;
  duration: number | null;
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

export interface Category {
  name: string;
  count: number;
}

export type ViewMode = "grid" | "list";
export type SortField = "created_at" | "title" | "file_size";
export type SortOrder = "asc" | "desc";
