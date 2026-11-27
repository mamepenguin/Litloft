import type { FileItem } from "@/types";

/**
 * Anything not listed here is dropped on redirect. ``nav`` has to survive
 * the redirect because the redirect rewrites the path to the file's own
 * folder and drops ``view`` / ``q`` / ``tag`` / ``smart_folder_id``, so a
 * file opened out of Liked would be indistinguishable from one opened out
 * of its folder.
 */
export const CARRIED_QUERY_KEYS = [
  "t",
  "page",
  "section",
  "highlight",
  "sort",
  "order",
  "edit",
  "nav",
  "find",
] as const;

const LEGACY_QUEUE_CARRIED_KEYS = [
  "t",
  "page",
  "section",
  "highlight",
  "find",
  "edit",
] as const;

function drivePath(drive: string, folderPath: string): string {
  const folderPart = folderPath
    ? "/" +
      folderPath
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/")
    : "";
  return `/drive/${encodeURIComponent(drive)}${folderPart}`;
}

export function buildCanonicalFileUrl(
  file: Pick<FileItem, "drive" | "folder_path">,
  fileId: string,
  sp: Record<string, string | string[] | undefined> = {},
): string {
  const carried = new URLSearchParams();
  carried.set("file", fileId);
  for (const key of CARRIED_QUERY_KEYS) {
    const v = sp[key];
    if (typeof v === "string" && v.length > 0) {
      carried.set(key, v);
    }
  }
  return `${drivePath(file.drive, file.folder_path)}?${carried.toString()}`;
}

/**
 * Where a legacy `/files/{id}` queue URL now points. Returns null when the
 * request is not one.
 */
export function buildLegacyQueueUrl(
  file: Pick<FileItem, "drive" | "folder_path">,
  fileId: string,
  sp: Record<string, string | string[] | undefined> = {},
): string | null {
  const collectionId =
    typeof sp.collection === "string" && sp.collection
      ? sp.collection
      : typeof sp.playlist === "string" && sp.playlist
        ? sp.playlist
        : null;
  const smartId =
    typeof sp.smart_collection === "string" && sp.smart_collection
      ? sp.smart_collection
      : null;
  const folderPlay = sp.folder_play === "1";

  const params = new URLSearchParams();
  params.set("file", fileId);

  let pathname: string;
  if (collectionId) {
    pathname = `${drivePath(file.drive, "")}/collections/${encodeURIComponent(collectionId)}`;
  } else if (smartId) {
    pathname = drivePath(file.drive, "");
    params.set("queue", `smart:${smartId}`);
  } else if (folderPlay) {
    pathname = drivePath(file.drive, file.folder_path);
    params.set("queue", "folder");
    for (const key of ["sort", "order"] as const) {
      const v = sp[key];
      if (typeof v === "string" && v.length > 0) params.set(key, v);
    }
  } else {
    return null;
  }

  for (const key of LEGACY_QUEUE_CARRIED_KEYS) {
    const v = sp[key];
    if (typeof v === "string" && v.length > 0) {
      params.set(key, v);
    }
  }

  return `${pathname}?${params.toString()}`;
}

/**
 * Where an in-app link to a listed file goes: the URL `/files/{id}` would
 * redirect to, so opening the file does not leave the drive's pages.
 */
export function fileLinkHref(
  file: Pick<FileItem, "id" | "drive" | "folder_path">,
  query = "",
): string {
  return buildCanonicalFileUrl(
    file,
    file.id,
    Object.fromEntries(new URLSearchParams(query)),
  );
}
