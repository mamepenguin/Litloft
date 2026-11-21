import { narrowFolders, normalizeFolder } from "./folders";

export interface FolderPosition {
  /** The position in the form the backend accepts; `null` at the top. */
  value: string | null;
  /** The URL carried a `folder` the backend would reject. */
  invalid: boolean;
}

/**
 * Reads the URL's `folder` the way the backend's `normalize_folder` does:
 * NFC, no leading or trailing slash, and no empty, `.` or `..` segment.
 */
export function readFolderPosition(raw: string | null | undefined): FolderPosition {
  if (raw === null || raw === undefined) return { value: null, invalid: false };
  const value = raw.normalize("NFC").replace(/^\/+|\/+$/g, "");
  if (
    value === "" ||
    value.includes("\u0000") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return { value: null, invalid: true };
  }
  return { value, invalid: false };
}

export interface FolderCrumb {
  /** The folder the crumb stands for. */
  folder: string;
  /** The folder's last segment. */
  name: string;
  /** The crumb is the end of the trail. */
  current: boolean;
  /** Choosing the crumb changes the view, so it is a link. */
  link: boolean;
}

function sameFolders(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((folder, i) => folder === b[i]);
}

/**
 * The trail under the position. `base` deepens it when it is the position or
 * lies under it; a folder-limited target's top draws the trail from `base`.
 */
export function folderCrumbs(
  position: string | null,
  targetFolders: readonly string[],
  base: string,
): FolderCrumb[] {
  const normalizedBase = normalizeFolder(base);
  const end =
    position === null
      ? normalizedBase
      : normalizedBase !== "" &&
          (normalizedBase === position || normalizedBase.startsWith(`${position}/`))
        ? normalizedBase
        : position;
  if (end === "") return [];

  const segments = end.split("/");
  return segments.map((name, index) => {
    const folder = segments.slice(0, index + 1).join("/");
    const strictAncestor =
      position !== null && position !== folder && position.startsWith(`${folder}/`);
    return {
      folder,
      name,
      current: folder === end,
      link: strictAncestor && !sameFolders(narrowFolders(targetFolders, folder), targetFolders),
    };
  });
}
