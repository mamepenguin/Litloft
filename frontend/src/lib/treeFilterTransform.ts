import type { FolderTreeNode, TreeTypeFilter } from "@/types";
import { fileMatchesTypeFilter } from "./fileTypeFilter";

export interface FilteredTreeRow {
  node: FolderTreeNode;
  depth: number;
  isExpanded: boolean;
  isLoading: false;
  isAncestor: boolean;
}

/**
 * Group flat tree nodes by their parent path so the rendering pass can
 * walk the hierarchy without further API calls.
 *
 * The drive root is keyed under the empty string. The split takes the
 * path's last `/` segment as the node name and the prefix as its parent.
 */
export function groupByParent(nodes: FolderTreeNode[]): Map<string, FolderTreeNode[]> {
  const byParent = new Map<string, FolderTreeNode[]>();
  for (const node of nodes) {
    const idx = node.path.lastIndexOf("/");
    const parent = idx === -1 ? "" : node.path.slice(0, idx);
    const list = byParent.get(parent);
    if (list) list.push(node);
    else byParent.set(parent, [node]);
  }
  return byParent;
}

interface MatchTables {
  /** Paths whose node matched the filter directly. */
  matched: Set<string>;
  /** Paths that should be visible as ancestors (dimmed). */
  ancestors: Set<string>;
  /** Folder paths whose subtree cascades because the folder name matched. */
  cascadingFolders: Set<string>;
}

function nodeMatches(
  node: FolderTreeNode,
  loweredText: string,
  typeFilter: TreeTypeFilter | null,
): boolean {
  const nameMatches =
    loweredText.length === 0 || node.name.toLowerCase().includes(loweredText);
  if (!nameMatches) return false;
  if (node.kind === "folder") {
    // Folders are not subject to type filter (they don't have a type),
    // and they only count as matches when the text filter is supplying a
    // signal — otherwise an empty text + type-only filter would surface
    // every folder.
    return loweredText.length > 0;
  }
  if (typeFilter === null) return true;
  return fileMatchesTypeFilter(
    {
      filename: node.name,
      mime_type: node.mime_type,
      file_type: node.file_type,
    },
    typeFilter,
  );
}

function ancestorsOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join("/"));
  }
  return out;
}

export function computeMatchTables(
  nodes: FolderTreeNode[],
  text: string,
  typeFilter: TreeTypeFilter | null,
): MatchTables {
  const loweredText = text.trim().toLowerCase();
  const matched = new Set<string>();
  const ancestors = new Set<string>();
  const cascadingFolders = new Set<string>();

  for (const node of nodes) {
    if (nodeMatches(node, loweredText, typeFilter)) {
      matched.add(node.path);
      if (node.kind === "folder") cascadingFolders.add(node.path);
    }
  }

  // Add ancestors for every match.
  for (const path of matched) {
    for (const a of ancestorsOf(path)) {
      if (!matched.has(a)) ancestors.add(a);
    }
  }

  return { matched, ancestors, cascadingFolders };
}

/**
 * Walk the (already grouped) tree and produce flat rows for rendering,
 * applying the filter visibility rules:
 *
 *  - matched nodes render normally
 *  - matched-folder descendants render normally (cascade)
 *  - ancestors of matches render dimmed
 *  - everything else is hidden
 */
export function buildFilteredRows(
  rootNodes: FolderTreeNode[],
  byParent: Map<string, FolderTreeNode[]>,
  tables: MatchTables,
): FilteredTreeRow[] {
  const out: FilteredTreeRow[] = [];

  const walk = (nodes: FolderTreeNode[], depth: number, cascade: boolean): void => {
    for (const node of nodes) {
      const isMatched = tables.matched.has(node.path);
      const isAncestor = tables.ancestors.has(node.path);
      const inCascade = cascade;
      const visible = isMatched || isAncestor || inCascade;
      if (!visible) continue;
      out.push({
        node,
        depth,
        isExpanded: true,
        isLoading: false,
        isAncestor: isAncestor && !isMatched && !inCascade,
      });
      if (node.kind === "folder") {
        const children = byParent.get(node.path) ?? [];
        const nextCascade = inCascade || tables.cascadingFolders.has(node.path);
        if (children.length > 0) walk(children, depth + 1, nextCascade);
      }
    }
  };

  walk(rootNodes, 0, false);
  return out;
}
