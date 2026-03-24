import type { Drive, Folder, PaginatedResponse, SortField, SortOrder, Tag, Video } from "@/types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
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

export async function getDriveVideos(
  drive: string,
  params: {
    path?: string;
    search?: string;
    favorite?: boolean;
    tag?: string;
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
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  return fetchJSON<PaginatedResponse>(
    `${API_BASE}/drives/${encodeURIComponent(drive)}/videos?${searchParams.toString()}`
  );
}

export async function getDriveTags(drive: string): Promise<Tag[]> {
  return fetchJSON<Tag[]>(`${API_BASE}/drives/${encodeURIComponent(drive)}/tags`);
}

export async function scanDrive(drive: string): Promise<{ added: number; removed: number; total: number }> {
  return fetchJSON(`${API_BASE}/drives/${encodeURIComponent(drive)}/scan`, { method: "POST" });
}

export async function getVideo(id: number): Promise<Video> {
  return fetchJSON<Video>(`${API_BASE}/videos/${id}`);
}

export async function updateVideo(
  id: number,
  data: { title?: string; description?: string }
): Promise<Video> {
  return fetchJSON<Video>(`${API_BASE}/videos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function likeVideo(id: number): Promise<Video> {
  return fetchJSON<Video>(`${API_BASE}/videos/${id}/like`, { method: "POST" });
}

export async function dislikeVideo(id: number): Promise<Video> {
  return fetchJSON<Video>(`${API_BASE}/videos/${id}/dislike`, { method: "POST" });
}

export async function toggleFavorite(id: number): Promise<Video> {
  return fetchJSON<Video>(`${API_BASE}/videos/${id}/favorite`, { method: "POST" });
}

export async function updateVideoTags(id: number, tags: string[]): Promise<Video> {
  return fetchJSON<Video>(`${API_BASE}/videos/${id}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
}

export function getStreamUrl(id: number): string {
  return `${API_BASE}/videos/${id}/stream`;
}

export function getThumbnailUrl(id: number): string {
  return `${API_BASE}/videos/${id}/thumbnail`;
}
