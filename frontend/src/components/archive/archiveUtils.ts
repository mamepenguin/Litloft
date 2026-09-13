import { isTextPreviewable } from "@/components/TextPreview";
import type { ArchiveEntry, ViewMode } from "@/types";

export const MAX_TEXT_AUTO_LOAD = 1024 * 1024;

export type ArchiveViewMode = "listing" | "image" | "text";

export function getDirname(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.substring(0, lastSlash);
}

export function getEntriesInDir(
  entries: ArchiveEntry[],
  dirPath: string,
): ArchiveEntry[] {
  return entries.filter((entry) => {
    if (dirPath === "") {
      if (entry.is_dir) {
        const withoutTrailing = entry.path.endsWith("/")
          ? entry.path.slice(0, -1)
          : entry.path;
        return !withoutTrailing.includes("/");
      }
      return !entry.path.includes("/");
    }
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    if (!entry.path.startsWith(prefix)) return false;
    const rest = entry.path.slice(prefix.length);
    if (entry.is_dir) {
      const cleaned = rest.endsWith("/") ? rest.slice(0, -1) : rest;
      if (cleaned === "") return false;
      return !cleaned.includes("/");
    }
    return !rest.includes("/");
  });
}

export function inferDirectories(
  entries: ArchiveEntry[],
  currentPath: string,
): ArchiveEntry[] {
  // Some ZIPs don't have explicit directory entries.
  const prefix = currentPath ? `${currentPath}/` : "";
  const dirNames = new Set<string>();

  for (const entry of entries) {
    if (!entry.path.startsWith(prefix) && currentPath !== "") continue;
    if (currentPath === "" && !entry.path.includes("/")) continue;

    const rest =
      currentPath === "" ? entry.path : entry.path.slice(prefix.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx > 0) {
      dirNames.add(rest.substring(0, slashIdx));
    }
  }

  const existingDirPaths = new Set(
    entries
      .filter((e) => e.is_dir)
      .map((e) => (e.path.endsWith("/") ? e.path.slice(0, -1) : e.path)),
  );

  const inferred: ArchiveEntry[] = [];
  for (const name of dirNames) {
    const fullPath = prefix ? `${prefix}${name}` : name;
    if (!existingDirPaths.has(fullPath)) {
      inferred.push({
        path: `${fullPath}/`,
        filename: name,
        file_size: 0,
        compressed_size: 0,
        file_type: "other",
        mime_type: "",
        is_dir: true,
      });
    }
  }

  return inferred;
}

/**
 * Directories are left out of the count because they never carry a thumbnail;
 * a level holding only folders would otherwise be a grid of folder icons.
 */
export function defaultArchiveViewMode(entries: ArchiveEntry[]): ViewMode {
  const files = entries.filter((entry) => !entry.is_dir);
  const images = files.filter((entry) => entry.file_type === "image");
  return images.length * 2 > files.length ? "grid" : "list";
}

export function canOpenArchiveEntry(entry: ArchiveEntry): boolean {
  if (entry.is_dir) return true;
  if (entry.file_type === "image") return true;
  return isTextPreviewable(entry.mime_type, entry.filename);
}
