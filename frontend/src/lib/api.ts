import type { ArchiveContents, AuthStatus, BatchRenameRequest, BatchRenameResponse, ChunkResponse, Comment, CommentsResponse, DashboardResponse, Drive, DriveSummary, DuplicatesResponse, FileItem, FileType, Folder, Neighbors, PaginatedResponse, PinnedFolder, PlaylistDetail, PlaylistSummary, SortField, SortOrder, Tag, UnlockResult, UploadInitResponse, WatchHistoryItem, WatchProgress } from "@/types";

const API_BASE = "/api";

export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
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

export async function getDriveFiles(
  drive: string,
  params: {
    path?: string;
    search?: string;
    favorite?: boolean;
    tag?: string;
    type?: FileType;
    sort?: SortField;
    order?: SortOrder;
    page?: number;
    limit?: number;
  }
): Promise<PaginatedResponse> {
  const searchParams = new URLSearchParams();
  if (params.path !== undefined) searchParams.set("path", params.path);
  if (params.search) searchParams.set("search", params.search);
  if (params.favorite !== undefined) searchParams.set("favorite", String(params.favorite));
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.type) searchParams.set("type", params.type);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  return fetchJSON<PaginatedResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/files?${searchParams.toString()}`
  );
}

export async function getDriveTags(drive: string): Promise<Tag[]> {
  return fetchJSON<Tag[]>(`${API_BASE}/drives/${encodeURIComponent(drive)}/tags`);
}

export async function scanDrive(drive: string): Promise<{ added: number; removed: number; total: number }> {
  return fetchJSON(`${API_BASE}/drives/${encodeURIComponent(drive)}/scan`, { method: "POST" });
}

export async function getFile(id: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}`);
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

export async function dislikeFile(id: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/dislike`, { method: "POST" });
}

export async function toggleFavorite(id: string): Promise<FileItem> {
  return fetchJSON<FileItem>(`${API_BASE}/files/${id}/favorite`, { method: "POST" });
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
  title: string;
}

export interface ActiveSummaryResponse {
  has_active_summary: boolean;
  file_id: string;
  summary_note?: ActiveSummaryNote;
}

export async function getActiveSummary(id: string): Promise<ActiveSummaryResponse> {
  return fetchJSON<ActiveSummaryResponse>(`${API_BASE}/files/${id}/active_summary`);
}

export interface RelatedFileSummary {
  id: string;
  drive: string;
  filename: string;
  folder_path: string;
  file_type: string;
  mime_type: string;
  thumbnail_url: string;
  has_thumbnail: boolean;
  file_size: number;
  missing_since: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRelationItem {
  relation_id: number;
  kind: string;
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

export function getDownloadUrl(id: string): string {
  return `${API_BASE}/files/${id}/stream?download=true`;
}

export function getThumbnailUrl(id: string): string {
  return `${API_BASE}/files/${id}/thumbnail`;
}

export function getSubtitleUrl(fileId: string, index: number): string {
  return `${API_BASE}/files/${fileId}/subtitles/${index}`;
}

// File operations
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

// Folder operations
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

// Upload
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
  await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/upload/${uploadId}`,
    { method: "DELETE", credentials: "include" }
  );
}

// Batch operations
export async function batchGetFiles(ids: string[]): Promise<FileItem[]> {
  return fetchJSON<FileItem[]>(`${API_BASE}/files/batch/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
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

// Pins
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

// Playlists
export async function getPlaylists(drive: string): Promise<PlaylistSummary[]> {
  return fetchJSON<PlaylistSummary[]>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists`
  );
}

export async function createPlaylist(drive: string, name: string): Promise<PlaylistSummary> {
  return fetchJSON<PlaylistSummary>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
}

export async function getPlaylist(drive: string, id: string): Promise<PlaylistDetail> {
  return fetchJSON<PlaylistDetail>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists/${id}`
  );
}

export async function updatePlaylist(drive: string, id: string, name: string): Promise<PlaylistSummary> {
  return fetchJSON<PlaylistSummary>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
}

export async function deletePlaylist(drive: string, id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists/${id}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function addPlaylistItems(
  drive: string,
  playlistId: string,
  fileIds: string[]
): Promise<PlaylistDetail> {
  return fetchJSON<PlaylistDetail>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists/${playlistId}/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_ids: fileIds }),
    }
  );
}

export async function removePlaylistItem(
  drive: string,
  playlistId: string,
  itemId: number
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists/${playlistId}/items/${itemId}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function reorderPlaylistItems(
  drive: string,
  playlistId: string,
  itemIds: number[]
): Promise<PlaylistDetail> {
  return fetchJSON<PlaylistDetail>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/playlists/${playlistId}/items/reorder`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: itemIds }),
    }
  );
}

// Archive
export async function getArchiveContents(id: string): Promise<ArchiveContents> {
  return fetchJSON<ArchiveContents>(`${API_BASE}/files/${id}/archive`);
}

export function getArchiveEntryUrl(id: string, entryPath: string): string {
  return `${API_BASE}/files/${id}/archive/entry?path=${encodeURIComponent(entryPath)}`;
}

// Watch Progress
export async function saveWatchProgress(fileId: string, position: number, duration: number): Promise<void> {
  await fetch(`${API_BASE}/files/${fileId}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ position, duration }),
  });
}

export async function getWatchProgress(fileId: string): Promise<WatchProgress> {
  return fetchJSON<WatchProgress>(`${API_BASE}/files/${fileId}/progress`);
}

export async function deleteWatchProgress(fileId: string): Promise<void> {
  await fetch(`${API_BASE}/files/${fileId}/progress`, {
    method: "DELETE",
    credentials: "include",
  });
}

export async function getWatchHistory(
  driveName: string,
  limit?: number,
  filter?: "unfinished" | "all"
): Promise<WatchHistoryItem[]> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (filter) params.set("filter", filter);
  const qs = params.toString();
  const result = await fetchJSON<{ data: WatchHistoryItem[] }>(
    `${API_BASE}/drives/${encodeURIComponent(driveName)}/watch-history${qs ? `?${qs}` : ""}`
  );
  return result.data;
}

// Trash
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

// Missing files
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

// Duplicates
export async function getDuplicates(drive: string): Promise<DuplicatesResponse> {
  return fetchJSON<DuplicatesResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/duplicates`
  );
}

// Admin
export async function getDashboard(): Promise<DashboardResponse> {
  return fetchJSON<DashboardResponse>(`${API_BASE}/admin/dashboard`);
}

// Comments
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

// Auth
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
