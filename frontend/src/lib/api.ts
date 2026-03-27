import type { ArchiveContents, AuthStatus, ChunkResponse, Drive, FileItem, FileType, Folder, Neighbors, PaginatedResponse, PinnedFolder, PlaylistDetail, PlaylistSummary, SortField, SortOrder, Tag, UnlockResult, UploadInitResponse } from "@/types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
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
  params: { filename: string; file_size: number; folder_path: string; chunk_size: number }
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
