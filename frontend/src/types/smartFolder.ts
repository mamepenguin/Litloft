import type { FileKind, SortField, SortOrder } from "./index";

export interface SmartFolder {
  id: string;
  drive: string;
  name: string;
  query: string;
  /**
   * The kind this smart folder is narrowed to.
   *
   * The server stores only four of them (`_SMART_FOLDER_FILE_TYPES`:
   * video / image / audio / document) and rejects the rest with a 422,
   * which the save button surfaces as "could not save". The request
   * type is the whole vocabulary because that is what a listing can be
   * narrowed to; the server stays the authority on what it will keep.
   * Widening the stored set means migrating saved rows — Phase 4.
   */
  file_type: FileKind | null;
  sort_by: SortField | null;
  sort_order: SortOrder | null;
  created_at: string;
  updated_at: string | null;
}

export interface SmartFolderCreate {
  name: string;
  query: string;
  file_type?: FileKind | null;
  sort_by?: SortField | null;
  sort_order?: SortOrder | null;
}

export type SmartFolderUpdate = Partial<SmartFolderCreate>;
