import type {
  FileKind,
  ListingSortField,
  PaginatedResponse,
  SortOrder,
  TrustFilter,
} from "@/types";

import { ApiStatusError } from "./apiError";

const API_BASE = "/api";

export interface ListingFilters {
  search?: string;
  favorite?: boolean;
  liked?: boolean;
  /** Several tags: every one must be on the file. */
  tag?: string | readonly string[];
  /** Several kinds: the file may be any of them. */
  type?: FileKind | readonly FileKind[];
  /** Each folder keeps its whole subtree. */
  folder?: string | readonly string[];
  /** Each collection name keeps its items. */
  collection?: string | readonly string[];
  /** Size comparisons in the wire form (`gt:1073741824`). */
  size?: string | readonly string[];
  /** Duration comparisons in the wire form (`gte:1800`). */
  duration?: string | readonly string[];
  /**
   * `verified` / `unverified` select a tier; `unreviewed` is not a tier but
   * the review queue — files nobody has ruled on, which spans both.
   */
  trust?: TrustFilter;
  /** Keep only files whose frontmatter origin equals this. */
  origin?: string;
  /** Drop files whose frontmatter origin equals this. */
  exclude_origin?: string;
}

export interface OriginFilters {
  /** Keep only files whose frontmatter origin equals this. */
  origin?: string;
  /** Drop files whose frontmatter origin equals this. */
  exclude_origin?: string;
}

export interface ListingRequestParams extends ListingFilters {
  path?: string;
  recursive?: boolean;
  sort?: ListingSortField;
  order?: SortOrder;
  page?: number;
  limit?: number;
}

export function appendListingFilters(
  searchParams: URLSearchParams,
  params: ListingFilters,
): void {
  if (params.search) searchParams.set("search", params.search);
  if (params.favorite !== undefined) searchParams.set("favorite", String(params.favorite));
  if (params.liked !== undefined) searchParams.set("liked", String(params.liked));
  for (const tag of [params.tag ?? []].flat()) if (tag) searchParams.append("tag", tag);
  for (const kind of [params.type ?? []].flat()) searchParams.append("type", kind);
  for (const folder of [params.folder ?? []].flat()) {
    if (folder) searchParams.append("folder", folder);
  }
  for (const collection of [params.collection ?? []].flat()) {
    if (collection) searchParams.append("collection", collection);
  }
  for (const size of [params.size ?? []].flat()) {
    if (size) searchParams.append("size", size);
  }
  for (const duration of [params.duration ?? []].flat()) {
    if (duration) searchParams.append("duration", duration);
  }
  if (params.trust) searchParams.set("trust", params.trust);
  if (params.origin) searchParams.set("origin", params.origin);
  if (params.exclude_origin) searchParams.set("exclude_origin", params.exclude_origin);
}

export function listingUrl(drive: string, params: ListingRequestParams): string {
  const searchParams = new URLSearchParams();
  if (params.path !== undefined) searchParams.set("path", params.path);
  if (params.recursive) searchParams.set("recursive", "true");
  appendListingFilters(searchParams, params);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  return `${API_BASE}/drives/${encodeURIComponent(drive)}/files?${searchParams.toString()}`;
}

export async function readListingPage(res: Response): Promise<PaginatedResponse> {
  if (!res.ok) {
    throw new ApiStatusError(res.status, `API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as PaginatedResponse;
}
