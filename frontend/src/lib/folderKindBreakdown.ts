import type { FolderKind } from "@/types";

export const MAX_BREAKDOWN_KINDS = 2;

export interface KindShare {
  kind: FolderKind;
  count: number;
}

export function folderKindBreakdown(
  kindCounts: Record<string, number>,
): KindShare[] {
  return Object.entries(kindCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_BREAKDOWN_KINDS)
    .map(([kind, count]) => ({ kind: kind as FolderKind, count }));
}
