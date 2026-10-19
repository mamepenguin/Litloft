"use client";

import { useMemo } from "react";
import { Folder, Hash, ListFilter } from "lucide-react";
import { useTranslations } from "next-intl";

import { filterBrowseRows, type BrowseNode } from "@/lib/folderBrowse";
import { matchFolders, matchJumps } from "@/lib/pageJump";
import {
  activeOperatorValue,
  completeOperator,
  parseSearchQuery,
  suggestValues,
} from "@/lib/searchQuery";
import { pinHrefFor } from "../sidebar/libraryRowActive";
import type { SearchScope } from "./GlobalSearchProvider";
import type { FolderBrowse } from "./useFolderBrowse";
import {
  useDriveTagNames,
  useJumpDestinations,
  useJumpFolders,
  type JumpDestination,
} from "./useJumpDestinations";

export interface LauncherRows {
  suggestions: JumpDestination[];
  pageJumps: JumpDestination[];
  folderJumps: JumpDestination[];
  /** Suggestions, page jumps, then folders: the order the keyboard walks them. */
  jumps: JumpDestination[];
  browseRows: BrowseNode[];
}

/** The rows the modal offers besides files: Go to, Folders, and a browsed folder's contents. */
export function useLauncherRows(
  open: boolean,
  scope: SearchScope | null,
  drive: string | null,
  query: string,
  browse: FolderBrowse,
): LauncherRows {
  const t = useTranslations("search");
  const browsing = browse.path !== null;
  const off = !!scope || !drive || browsing;
  const destinations = useJumpDestinations(open && !scope, drive);
  const folderIndex = useJumpFolders(open && !scope, drive);
  const tags = useDriveTagNames(open, drive);
  const suggestions = useMemo<JumpDestination[]>(() => {
    const active = browsing || !drive ? null : activeOperatorValue(query);
    if (!active) return [];
    const used = parseSearchQuery(query.slice(0, active.replaceFrom)).tags;
    return suggestValues(active, tags, used).map(({ value, count }) => ({
      key: `suggest:${active.operator}:${value}`,
      label: value,
      names: [],
      href: "",
      icon: active.operator === "tag" ? Hash : ListFilter,
      detail: count === undefined ? undefined : String(count),
      complete: completeOperator(query, active, value),
    }));
  }, [browsing, drive, query, tags]);
  const pageJumps = useMemo(
    () => (off ? [] : matchJumps(destinations, query)),
    [off, destinations, query],
  );
  const folderJumps = useMemo<JumpDestination[]>(() => {
    if (off || !drive) return [];
    const driveBase = `/drive/${encodeURIComponent(drive)}`;
    const shown = new Set(pageJumps.map((jump) => jump.key));
    return matchFolders(folderIndex, query, shown).map((folder) => ({
      key: folder.key,
      label: folder.name,
      names: [],
      href: pinHrefFor(driveBase, folder.path),
      icon: Folder,
      folderPath: folder.path,
      detail: folder.path.includes("/")
        ? folder.path.slice(0, folder.path.lastIndexOf("/"))
        : t("driveRoot"),
    }));
  }, [off, drive, folderIndex, pageJumps, query, t]);
  const browseRows = useMemo(
    () => (browsing ? filterBrowseRows(browse.nodes, query) : []),
    [browsing, browse.nodes, query],
  );
  const jumps = useMemo(
    () => [...suggestions, ...pageJumps, ...folderJumps],
    [suggestions, pageJumps, folderJumps],
  );

  return { suggestions, pageJumps, folderJumps, jumps, browseRows };
}
