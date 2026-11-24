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
  /** The file carries none of these tags. */
  exclude_tag?: string | readonly string[];
  /** The file is none of these kinds. */
  exclude_type?: FileKind | readonly FileKind[];
  /** The file is in none of these folders or their subfolders. */
  exclude_folder?: string | readonly string[];
  /** The file is in none of these collections. */
  exclude_collection?: string | readonly string[];
  /** `true` keeps files with a tag, `false` those with none. */
  has_tag?: boolean;
  /** `true` keeps files in a collection, `false` those in none. */
  has_collection?: boolean;
  /** Size comparisons in the wire form (`gt:1073741824`). */
  size?: string | readonly string[];
  /** Duration comparisons in the wire form (`gte:1800`). */
  duration?: string | readonly string[];
  /** Modification-time comparisons in the wire form (`lt:1704034800`). */
  modified?: string | readonly string[];
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
  for (const tag of [params.exclude_tag ?? []].flat()) {
    if (tag) searchParams.append("exclude_tag", tag);
  }
  for (const kind of [params.exclude_type ?? []].flat()) {
    searchParams.append("exclude_type", kind);
  }
  for (const folder of [params.exclude_folder ?? []].flat()) {
    if (folder) searchParams.append("exclude_folder", folder);
  }
  for (const collection of [params.exclude_collection ?? []].flat()) {
    if (collection) searchParams.append("exclude_collection", collection);
  }
  if (params.has_tag !== undefined) searchParams.set("has_tag", String(params.has_tag));
  if (params.has_collection !== undefined) {
    searchParams.set("has_collection", String(params.has_collection));
  }
  for (const size of [params.size ?? []].flat()) {
    if (size) searchParams.append("size", size);
  }
  for (const duration of [params.duration ?? []].flat()) {
    if (duration) searchParams.append("duration", duration);
  }
  for (const modified of [params.modified ?? []].flat()) {
    if (modified) searchParams.append("modified", modified);
  }
  if (params.trust) searchParams.set("trust", params.trust);
  if (params.origin) searchParams.set("origin", params.origin);
  if (params.exclude_origin) searchParams.set("exclude_origin", params.exclude_origin);
}

function listingSearchParams(params: ListingRequestParams): string {
  const searchParams = new URLSearchParams();
  if (params.path !== undefined) searchParams.set("path", params.path);
  if (params.recursive) searchParams.set("recursive", "true");
  appendListingFilters(searchParams, params);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  return searchParams.toString();
}

export function listingUrl(drive: string, params: ListingRequestParams): string {
  return `${API_BASE}/drives/${encodeURIComponent(drive)}/files?${listingSearchParams(params)}`;
}

export function listingQueryUrl(drive: string, params: ListingRequestParams): string {
  return `${API_BASE}/drives/${encodeURIComponent(drive)}/files/query?${listingSearchParams(params)}`;
}

export async function readListingPage(res: Response): Promise<PaginatedResponse> {
  if (!res.ok) {
    throw new ApiStatusError(res.status, `API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as PaginatedResponse;
}
