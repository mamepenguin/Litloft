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
  "highlight",
  "sort",
  "order",
  "edit",
  "nav",
] as const;

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
  const drivePart = encodeURIComponent(file.drive);
  const folderPart = file.folder_path
    ? "/" +
      file.folder_path
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/")
    : "";
  return `/drive/${drivePart}${folderPart}?${carried.toString()}`;
}
