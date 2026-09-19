import type { ArchiveContents, AuthStatus, BatchRenameRequest, BatchRenameResponse, ChunkResponse, CollectionDetail, CollectionSummary, Comment, CommentsResponse, DashboardResponse, Drive, DriveSummary, DuplicatesResponse, FileExif, FileItem, Folder, FolderCount, FolderTreeNode, Neighbors, PaginatedResponse, PinnedFolder, ListingSortField, SortField, SortOrder, Tag, TrustFilter, TrustTier, FileKind, UnlockResult, UploadInitResponse, WatchHistoryItem, WatchProgress } from "@/types";
import type { SmartFolder, SmartFolderCreate, SmartFolderUpdate } from "@/types/smartFolder";
import { seedFiles } from "@/lib/fileSeed";

const API_BASE = "/api";

export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export async function getDrives(): Promise<Drive[]> {
  return fetchJSON<Drive[]>(`${API_BASE}/drives`);
}

export async function getFolders(drive: string, path?: string): Promise<Folder[]> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  const qs = params.toString();
  return fetchJSON<Folder[]>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/folders${qs ? `?${qs}` : ""}`
  );
}

export async function getFolderTree(
  drive: string,
  params: {
    root?: string;
    type_filter?: FileKind | null;
    depth?: number;
    flat?: boolean;
    include_files?: boolean;
  } = {},
  options?: RequestOptions,
): Promise<FolderTreeNode[]> {
  const search = new URLSearchParams();
  if (params.root) search.set("root", params.root);
  if (params.type_filter) search.set("type_filter", params.type_filter);
  if (params.depth !== undefined) search.set("depth", String(params.depth));
  if (params.flat) search.set("flat", "true");
  // Only sent when true: the endpoint's default is folders-only, and the
  // UI's default is the same, so the quiet case is the empty query string.
  if (params.include_files) search.set("include_files", "true");
  const qs = search.toString();
  return fetchJSON<FolderTreeNode[]>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/folder-tree${qs ? `?${qs}` : ""}`,
    { signal: options?.signal },
  );
}

export async function getDriveFiles(
  drive: string,
  params: {
    path?: string;
    recursive?: boolean;
    search?: string;
    favorite?: boolean;
    liked?: boolean;
    tag?: string;
    type?: FileKind;
    /**
     * `verified` / `unverified` select a tier; `unreviewed` is not a tier but
     * the review queue — files nobody has ruled on, which spans both.
     */
    trust?: TrustFilter;
    sort?: ListingSortField;
    order?: SortOrder;
    page?: number;
    limit?: number;
  },
  options?: RequestOptions,
): Promise<PaginatedResponse> {
  const searchParams = new URLSearchParams();
  if (params.path !== undefined) searchParams.set("path", params.path);
  if (params.recursive) searchParams.set("recursive", "true");
  if (params.search) searchParams.set("search", params.search);
  if (params.favorite !== undefined) searchParams.set("favorite", String(params.favorite));
  if (params.liked !== undefined) searchParams.set("liked", String(params.liked));
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.type) searchParams.set("type", params.type);
  if (params.trust) searchParams.set("trust", params.trust);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const page = await fetchJSON<PaginatedResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/files?${searchParams.toString()}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
  seedFiles(page.data);
  return page;
}

export async function getDriveTags(
  drive: string,
  folderPath?: string | null,
  type?: FileKind,
  /** Files directly in this folder only; `""` is the drive root. */
  path?: string | null,
): Promise<Tag[]> {
  const params = new URLSearchParams();
  if (folderPath) params.set("folder_path", folderPath);
  if (path !== undefined && path !== null) params.set("path", path);
  if (type) params.set("type", type);
  const qs = params.toString();
  return fetchJSON<Tag[]>(`${API_BASE}/drives/${encodeURIComponent(drive)}/tags${qs ? `?${qs}` : ""}`);
}

export async function getFolderCounts(drive: string, type?: FileKind): Promise<FolderCount[]> {
  const query = type ? `?${new URLSearchParams({ type })}` : "";
  return fetchJSON<FolderCount[]>(`${API_BASE}/drives/${encodeURIComponent(drive)}/folder-counts${query}`);
}

export interface ScanResult {
  added: number;
  missing: number;
  recovered: number;
  updated: number;
  total: number;
}

export class ApiStatusError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiStatusError";
  }
}

export async function scanDrive(drive: string): Promise<ScanResult> {
  const res = await fetch(`${API_BASE}/drives/${encodeURIComponent(drive)}/scan`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    // 409 means a scan is already running — a different thing to say
    // than "that failed", so the status has to survive the throw.
    throw new ApiStatusError(res.status, `API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<ScanResult>;
}

export async function getFile(id: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}`);
}

const inFlightFiles = new Map<string, Promise<FileItem>>();

/**
 * `getFile` for opening a file: everyone who asks while a request is out
 * gets that request, so the page and the view inside it cost one round
 * trip. Not for refetching after a write — that must see the write.
 */
export function getFileShared(id: string): Promise<FileItem> {
  const pending = inFlightFiles.get(id);
  if (pending) return pending;
  const request = getFile(id)
    .then((file) => {
      seedFiles([file]);
      return file;
    })
    .finally(() => {
      inFlightFiles.delete(id);
    });
  inFlightFiles.set(id, request);
  return request;
}

export async function getFileExif(id: string): Promise<FileExif> {
  return fetchJSON<FileExif>(`${API_BASE}/files/${id}/exif`);
}

export async function updateFile(
  id: string,
  data: { title?: string; description?: string }
): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function likeFile(id: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/like`, { method: "POST" });
}

export async function toggleFavorite(id: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/favorite`, { method: "POST" });
}

export async function setFileTrustTier(
  id: string,
  tier: TrustTier
): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/trust-tier`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
}

export async function updateFileTags(id: string, tags: string[]): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
}

export interface ActiveSummaryNote {
  file_id: string;
  drive: string;
  path: string;
  title: string | null;
}

export interface ActiveSummaryResponse {
  has_active_summary: boolean;
  file_id: string;
  summary_note?: ActiveSummaryNote | null;
}

// A 404 from the addon proxy means knowledge isn't installed — surface as
// has_active_summary: false so the file detail page falls back to the AI
// summary instead of erroring out.
export async function getActiveSummary(
  id: string,
  drive: string,
): Promise<ActiveSummaryResponse> {
  const res = await fetch(
    `${API_BASE}/addons/knowledge/file_active_summary/${id}/note`,
    {
      credentials: "include",
      headers: { "X-Lit-Drive": encodeURIComponent(drive) },
    },
  );
  if (res.status === 404) {
    return { has_active_summary: false, file_id: id };
  }
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface RelatedFileSummary {
  id: string;
  drive: string;
  filename: string;
  title: string;
  folder_path: string;
  file_type: string;
  mime_type: string;
  thumbnail_url: string;
  has_thumbnail: boolean;
  file_size: number;
  duration: number | null;
  missing_since: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRelationItem {
  relation_id: number;
  kind: string;
  direction: "outgoing" | "incoming";
  /** Direction says who links to whom only for `markdown`. */
  origin: "markdown" | "internal" | null;
  created_at: string;
  created_by: string | null;
  file: RelatedFileSummary;
}

export interface FileRelationsResponse {
  relations: FileRelationItem[];
}

export async function getFileRelations(
  id: string,
  kind?: string,
): Promise<FileRelationsResponse> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return fetchJSON<FileRelationsResponse>(
    `${API_BASE}/files/${id}/relations${qs}`,
  );
}

export interface FileChapter {
  start_time: number;
  /** Null when the producer did not state one; derive from the next start. */
  end_time: number | null;
  title: string;
  ordering: number;
}

export interface FileChaptersResponse {
  chapters: FileChapter[];
  /**
   * Provenance class of the whole set: re-derivable from the file or its
   * provider, or approved by a person.
   */
  source: "extracted" | "curated" | null;
}

export async function getFileChapters(
  id: string,
): Promise<FileChaptersResponse> {
  return fetchJSON<FileChaptersResponse>(`${API_BASE}/files/${id}/chapters`);
}

export async function getFileNeighbors(
  id: string,
  sort?: string,
  order?: string
): Promise<Neighbors> {
  const params = new URLSearchParams();
  if (sort) params.set("sort", sort);
  if (order) params.set("order", order);
  const qs = params.toString();
  return fetchJSON<Neighbors>(`${API_BASE}/files/${id}/neighbors${qs ? `?${qs}` : ""}`);
}

export function getStreamUrl(id: string): string {
  return `${API_BASE}/files/${id}/stream`;
}

export function getPreviewTextUrl(id: string): string {
  return `${API_BASE}/files/${id}/preview-text`;
}

export function getDownloadUrl(id: string): string {
  return `${API_BASE}/files/${id}/stream?download=true`;
}

export function getThumbnailUrl(id: string): string {
  return `${API_BASE}/files/${id}/thumbnail`;
}

export function getRenderUrl(id: string): string {
  return `${API_BASE}/files/${id}/render`;
}

export function getSubtitleUrl(fileId: string, index: number): string {
  return `${API_BASE}/files/${fileId}/subtitles/${index}`;
}

export async function renameFile(id: string, newFilename: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/rename`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_filename: newFilename }),
  });
}

export async function moveFile(id: string, targetFolderPath: string, targetDrive?: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/move`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_folder_path: targetFolderPath, target_drive: targetDrive }),
  });
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/files/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

// Backend auto-suffixes the filename on collision; on missing-state
// recovery the same FileItem.id is returned with a 200 status (the
// caller doesn't see status here — only the parsed body).
export async function createTextFile(
  drive: string,
  body: { path: string; content: string },
): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/drives/${encodeURIComponent(drive)}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createFolder(drive: string, path: string, name: string): Promise<Folder> {
  return fetchJSON<Folder>(`${API_BASE}/drives/${encodeURIComponent(drive)}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, name }),
  });
}

export async function renameFolder(drive: string, path: string, newName: string): Promise<Folder> {
  return fetchJSON<Folder>(`${API_BASE}/drives/${encodeURIComponent(drive)}/folders`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, new_name: newName }),
  });
}

export async function moveFolder(drive: string, path: string, targetPath: string): Promise<Folder> {
  return fetchJSON<Folder>(`${API_BASE}/drives/${encodeURIComponent(drive)}/folders/move`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, target_path: targetPath }),
  });
}

export async function deleteFolder(drive: string, path: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/folders?path=${encodeURIComponent(path)}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function initUpload(
  drive: string,
  params: { filename: string; file_size: number; folder_path: string; chunk_size: number; relative_path?: string }
): Promise<UploadInitResponse> {
  return fetchJSON<UploadInitResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/upload/init`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }
  );
}

export async function uploadChunk(
  drive: string,
  uploadId: string,
  chunkIndex: number,
  chunk: Blob
): Promise<ChunkResponse> {
  const form = new FormData();
  form.append("chunk_index", String(chunkIndex));
  form.append("chunk", chunk);
  return fetchJSON<ChunkResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/upload/${uploadId}/chunk`,
    { method: "POST", body: form }
  );
}

export async function completeUpload(drive: string, uploadId: string): Promise<FileItem> {
  return fetchJSON<FileItem>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/upload/${uploadId}/complete`,
    { method: "POST" }
  );
}

export async function cancelUpload(drive: string, uploadId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/upload/${uploadId}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`Cancel upload failed: ${res.status}`);
}

export async function batchGetFiles(ids: string[]): Promise<FileItem[]> {
  const files = await fetchJSON<FileItem[]>(`${API_BASE}/files/batch/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  seedFiles(files);
  return files;
}

export async function batchDelete(ids: string[]): Promise<{ deleted: number; errors: { id: string; error: string }[] }> {
  return fetchJSON(`${API_BASE}/files/batch/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function batchMove(
  ids: string[],
  targetFolderPath: string,
  targetDrive?: string
): Promise<{ moved: number; errors: { id: string; error: string }[] }> {
  return fetchJSON(`${API_BASE}/files/batch/move`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, target_folder_path: targetFolderPath, target_drive: targetDrive }),
  });
}

export async function copyFile(
  id: string,
  targetPath: string,
  targetDrive?: string
): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_folder_path: targetPath, target_drive: targetDrive }),
  });
}

export async function batchCopy(
  ids: string[],
  targetFolderPath: string,
  targetDrive?: string
): Promise<{ copied: number; errors: string[] }> {
  return fetchJSON(`${API_BASE}/files/batch/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, target_folder_path: targetFolderPath, target_drive: targetDrive }),
  });
}

export async function batchRename(body: BatchRenameRequest): Promise<BatchRenameResponse> {
  return fetchJSON<BatchRenameResponse>(`${API_BASE}/files/batch/rename`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function batchTag(
  ids: string[],
  tags: string[]
): Promise<{ updated: number; errors: { id: string; error: string }[] }> {
  return fetchJSON(`${API_BASE}/files/batch/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, tags }),
  });
}

export async function getPins(drive: string): Promise<PinnedFolder[]> {
  return fetchJSON<PinnedFolder[]>(`${API_BASE}/drives/${encodeURIComponent(drive)}/pins`);
}

export async function addPin(drive: string, path: string): Promise<PinnedFolder> {
  return fetchJSON<PinnedFolder>(`${API_BASE}/drives/${encodeURIComponent(drive)}/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function removePin(drive: string, path: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/pins?path=${encodeURIComponent(path)}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function getSmartFolders(drive: string): Promise<SmartFolder[]> {
  return fetchJSON<SmartFolder[]>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/smart-folders`,
  );
}

export async function createSmartFolder(
  drive: string,
  payload: SmartFolderCreate,
): Promise<SmartFolder> {
  return fetchJSON<SmartFolder>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/smart-folders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function updateSmartFolder(
  drive: string,
  id: string,
  payload: SmartFolderUpdate,
): Promise<SmartFolder> {
  return fetchJSON<SmartFolder>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/smart-folders/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteSmartFolder(drive: string, id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/smart-folders/${encodeURIComponent(id)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function getCollections(drive: string): Promise<CollectionSummary[]> {
  return fetchJSON<CollectionSummary[]>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections`
  );
}

export async function createCollection(
  drive: string,
  name: string,
  description?: string | null,
): Promise<CollectionSummary> {
  return fetchJSON<CollectionSummary>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description ?? null }),
    }
  );
}

export async function getCollection(drive: string, id: string): Promise<CollectionDetail> {
  const collection = await fetchJSON<CollectionDetail>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections/${id}`
  );
  seedFiles(collection.items?.map((entry) => entry.file));
  return collection;
}

export interface CollectionUpdate {
  name?: string;
  description?: string | null;
}

export async function updateCollection(
  drive: string,
  id: string,
  patch: CollectionUpdate,
): Promise<CollectionSummary> {
  return fetchJSON<CollectionSummary>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );
}

export async function deleteCollection(drive: string, id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections/${id}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function addCollectionItems(
  drive: string,
  collectionId: string,
  fileIds: string[]
): Promise<CollectionDetail> {
  return fetchJSON<CollectionDetail>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections/${collectionId}/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_ids: fileIds }),
    }
  );
}

export async function removeCollectionItem(
  drive: string,
  collectionId: string,
  itemId: number
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections/${collectionId}/items/${itemId}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function reorderCollectionItems(
  drive: string,
  collectionId: string,
  itemIds: number[]
): Promise<CollectionDetail> {
  return fetchJSON<CollectionDetail>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/collections/${collectionId}/items/reorder`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: itemIds }),
    }
  );
}

export async function getArchiveContents(id: string): Promise<ArchiveContents> {
  return fetchJSON<ArchiveContents>(`${API_BASE}/files/${id}/archive`);
}

export function getArchiveEntryUrl(id: string, entryPath: string): string {
  return `${API_BASE}/files/${id}/archive/entry?path=${encodeURIComponent(entryPath)}`;
}

export async function saveWatchProgress(fileId: string, position: number, duration: number): Promise<void> {
  await fetch(`${API_BASE}/files/${fileId}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ position, duration }),
  });
}

// "Page-opened" record for non-media files. Hits the same endpoint as
// saveWatchProgress with both fields omitted; backend bumps last_played_at
// only and leaves playback_position/duration untouched on existing rows.
export async function recordFileView(fileId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/files/${fileId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
  } catch {
    // Fire-and-forget. Network failure must not break the file detail
    // page render — the personal_history filter degrades gracefully when
    // the row is missing.
  }
}

export async function getWatchProgress(fileId: string): Promise<WatchProgress> {
  return fetchJSON<WatchProgress>(`${API_BASE}/files/${fileId}/progress`);
}

export async function deleteWatchProgress(fileId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/files/${fileId}/progress`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to delete watch progress (${res.status})`);
}

export async function getWatchHistory(
  driveName: string,
  limit?: number,
  filter?: "unfinished" | "all",
  type?: FileKind | null,
): Promise<WatchHistoryItem[]> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (filter) params.set("filter", filter);
  if (type) params.set("type", type);
  const qs = params.toString();
  const result = await fetchJSON<{ data: WatchHistoryItem[] }>(
    `${API_BASE}/drives/${encodeURIComponent(driveName)}/watch-history${qs ? `?${qs}` : ""}`
  );
  seedFiles(result.data);
  return result.data;
}

export async function getTrash(
  drive: string,
  params?: { sort?: SortField; order?: SortOrder; page?: number; limit?: number }
): Promise<PaginatedResponse> {
  const searchParams = new URLSearchParams();
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.order) searchParams.set("order", params.order);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  return fetchJSON<PaginatedResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/trash${qs ? `?${qs}` : ""}`
  );
}

export async function restoreFile(id: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/restore`, { method: "POST" });
}

export async function purgeFile(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/files/${id}/purge`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function emptyTrash(drive: string): Promise<{ purged: number }> {
  return fetchJSON<{ purged: number }>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/trash/empty`,
    { method: "POST" }
  );
}

export async function getMissing(
  drive: string,
  params?: { sort?: "missing_since" | SortField; order?: SortOrder; page?: number; limit?: number }
): Promise<PaginatedResponse> {
  const searchParams = new URLSearchParams();
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.order) searchParams.set("order", params.order);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  return fetchJSON<PaginatedResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/missing${qs ? `?${qs}` : ""}`
  );
}

export async function purgeAllMissing(drive: string): Promise<{ purged: number }> {
  return fetchJSON<{ purged: number }>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/missing/purge-all`,
    { method: "POST" }
  );
}

export async function getDriveSummary(drive: string): Promise<DriveSummary> {
  return fetchJSON<DriveSummary>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/summary`
  );
}

export async function batchRestore(ids: string[]): Promise<{ restored: number; errors: { id: string; error: string }[] }> {
  return fetchJSON(`${API_BASE}/files/batch/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function batchPurge(ids: string[]): Promise<{ purged: number; errors: { id: string; error: string }[] }> {
  return fetchJSON(`${API_BASE}/files/batch/purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function getDuplicates(drive: string): Promise<DuplicatesResponse> {
  const duplicates = await fetchJSON<DuplicatesResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/duplicates`
  );
  seedFiles(duplicates.groups?.flatMap((group) => group.files));
  return duplicates;
}

export async function getDashboard(): Promise<DashboardResponse> {
  return fetchJSON<DashboardResponse>(`${API_BASE}/admin/dashboard`);
}

export async function getComments(fileId: string): Promise<CommentsResponse> {
  return fetchJSON<CommentsResponse>(`${API_BASE}/files/${fileId}/comments`);
}

export async function createComment(fileId: string, body: string): Promise<Comment> {
  return fetchJSON<Comment>(`${API_BASE}/files/${fileId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function updateComment(fileId: string, commentId: string, body: string): Promise<Comment> {
  return fetchJSON<Comment>(`${API_BASE}/files/${fileId}/comments/${commentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function deleteComment(fileId: string, commentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/files/${fileId}/comments/${commentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function unlock(
  password: string,
  remember: boolean
): Promise<UnlockResult> {
  return fetchJSON<UnlockResult>(`${API_BASE}/auth/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, remember }),
  });
}

export async function lock(): Promise<void> {
  await fetchJSON(`${API_BASE}/auth/lock`, { method: "POST" });
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return fetchJSON<AuthStatus>(`${API_BASE}/auth/status`);
}

export type WikiResolveResult =
  | {
      kind: "resolved";
      file_id: string;
      filename?: string;
      /** Filename without the ``.md`` suffix — preferred display text
       * for id-form targets (``[[20260512143028]]``). */
      basename?: string;
    }
  | { kind: "unresolved" }
  | { kind: "ambiguous"; candidates: string[] };

export async function getWikiResolutions(
  fileId: string,
): Promise<Record<string, WikiResolveResult>> {
  const res = await fetch(
    `${API_BASE}/files/${encodeURIComponent(fileId)}/wiki-resolutions`,
    { credentials: "include" },
  );
  if (res.status === 404) {
    throw new Error("wiki-resolutions: 404 file not found");
  }
  if (res.status === 415) {
    throw new Error("wiki-resolutions: not a markdown file");
  }
  if (!res.ok) {
    throw new Error(`wiki-resolutions failed: ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (
    !body ||
    typeof body !== "object" ||
    !("resolutions" in (body as Record<string, unknown>))
  ) {
    throw new Error("wiki-resolutions: unexpected response shape");
  }
  const resolutions = (body as { resolutions: unknown }).resolutions;
  if (!resolutions || typeof resolutions !== "object") {
    throw new Error("wiki-resolutions: unexpected resolutions value");
  }
  return resolutions as Record<string, WikiResolveResult>;
}
