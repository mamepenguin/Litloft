import type { Page } from "@playwright/test";

const API = "http://localhost:3000/api";

interface Drive {
  name: string;
  readonly?: boolean;
  protected?: boolean;
}

export interface FileItem {
  id: string;
  title: string;
  filename: string;
  file_type: string;
  drive: string;
  folder_path: string;
}

interface PaginatedFiles {
  data: FileItem[];
  meta: { total: number; page: number; limit: number };
}

interface PlaylistSummary {
  id: string;
  name: string;
  item_count: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getDrives(): Promise<Drive[]> {
  return apiFetch<Drive[]>("/drives");
}

export async function getFirstDrive(): Promise<Drive | null> {
  const drives = await getDrives();
  return drives[0] ?? null;
}

export async function getWritableDrive(): Promise<Drive | null> {
  const drives = await getDrives();
  return drives.find((d) => !d.readonly) ?? null;
}

export async function getDriveFiles(
  drive: string,
  params?: { path?: string; type?: string; limit?: number }
): Promise<PaginatedFiles> {
  const sp = new URLSearchParams();
  if (params?.path) sp.set("path", params.path);
  if (params?.type) sp.set("type", params.type);
  if (params?.limit) sp.set("limit", String(params.limit));
  return apiFetch<PaginatedFiles>(
    `/drives/${encodeURIComponent(drive)}/files?${sp.toString()}`
  );
}

export async function getAuthStatus(): Promise<{
  has_protected_drives: boolean;
  unlocked_groups: string[];
}> {
  return apiFetch("/auth/status");
}

export async function createPlaylist(
  drive: string,
  name: string
): Promise<PlaylistSummary> {
  return apiFetch<PlaylistSummary>(
    `/drives/${encodeURIComponent(drive)}/playlists`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
}

export async function addPlaylistItems(
  drive: string,
  playlistId: string,
  fileIds: string[]
): Promise<void> {
  await apiFetch(
    `/drives/${encodeURIComponent(drive)}/playlists/${playlistId}/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_ids: fileIds }),
    }
  );
}

export async function deletePlaylist(
  drive: string,
  id: string
): Promise<void> {
  await fetch(`${API}/drives/${encodeURIComponent(drive)}/playlists/${id}`, {
    method: "DELETE",
  });
}

export async function deleteFile(id: string): Promise<void> {
  await fetch(`${API}/files/${id}`, { method: "DELETE" });
}

export async function createTextFile(
  drive: string,
  path: string,
  content: string,
): Promise<FileItem> {
  return apiFetch<FileItem>(
    `/drives/${encodeURIComponent(drive)}/files`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    },
  );
}

/** Wait for the app to be loaded (header visible) */
export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector("header", { timeout: 10_000 });
}
