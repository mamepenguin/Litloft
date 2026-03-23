import type { Category, PaginatedResponse, SortField, SortOrder, Tag, Video } from "@/types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getVideos(params: {
  category?: string;
  search?: string;
  favorite?: boolean;
  tag?: string;
  sort?: SortField;
  order?: SortOrder;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const searchParams = new URLSearchParams();
  if (params.category) searchParams.set("category", params.category);
  if (params.search) searchParams.set("search", params.search);
  if (params.favorite !== undefined) searchParams.set("favorite", String(params.favorite));
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  return fetchJSON<PaginatedResponse>(
    `${API_BASE}/videos?${searchParams.toString()}`
  );
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

export async function getTags(): Promise<Tag[]> {
  return fetchJSON<Tag[]>(`${API_BASE}/tags`);
}

export async function updateVideoTags(id: number, tags: string[]): Promise<Video> {
  return fetchJSON<Video>(`${API_BASE}/videos/${id}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
}

export async function getCategories(): Promise<Category[]> {
  return fetchJSON<Category[]>(`${API_BASE}/categories`);
}

export async function triggerScan(): Promise<{ added: number; removed: number; total: number }> {
  return fetchJSON(`${API_BASE}/scan`, { method: "POST" });
}

export function getStreamUrl(id: number): string {
  return `${API_BASE}/videos/${id}/stream`;
}

export function getThumbnailUrl(id: number): string {
  return `${API_BASE}/videos/${id}/thumbnail`;
}
