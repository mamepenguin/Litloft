import type { FileType, SortField, SortOrder } from "./index";

export interface SmartFolder {
  id: string;
  drive: string;
  name: string;
  query: string;
  file_type: FileType | null;
  sort_by: SortField | null;
  sort_order: SortOrder | null;
  created_at: string;
  updated_at: string | null;
}

export interface SmartFolderCreate {
  name: string;
  query: string;
  file_type?: FileType | null;
  sort_by?: SortField | null;
  sort_order?: SortOrder | null;
}

export type SmartFolderUpdate = Partial<SmartFolderCreate>;
