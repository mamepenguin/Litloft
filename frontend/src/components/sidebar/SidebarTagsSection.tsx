import type React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown01, ArrowDownAZ, Tag, Tags } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ScopedTags } from "./useSidebarData";
import { samePath } from "./isSidebarLinkActive";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";
import { sortTags, useTagSortMode } from "./useTagSortMode";
import { SidebarSectionHeading } from "./SidebarSectionHeading";

/**
 * How many tags the section shows before it folds the rest away. A
 * drive can carry dozens; past this the list stops being a shortcut
 * and starts being the reason the sections below it are off-screen.
 */
const COLLAPSED_TAG_COUNT = 8;

interface SidebarTagsSectionProps {
  /** The drive we are currently in. Also keys the per-drive sort mode. */
  drive?: string | null;
  /**
   * The folder we are currently in, straight from `useCurrentFolderPath()`
   * via Sidebar — never re-derived from `usePathname()`. Two independent
   * computations of "what folder are we in" is what produced the defect
   * this section exists to fix.
   */
  currentFolderPath: string | null;
  /**
   * The live `usePathname()`. A tag row can only be *selected* while we
   * are actually on the page its scope describes: `currentFolderPath` is
   * stably null on the search / collections / addon / file-detail routes
   * too, so scope agreement alone would let a stray `?tag=` there mark a
   * row selected and turn its link into "leave this route".
   */
  pathname: string;
  /** The tag currently applied via `?tag=`, if any. */
  activeTag: string | null;
  /** `?view=` wins over `?tag=` in the drive route, so a view suppresses selection. */
  activeView: string | null;
  tags: ScopedTags | null;
  linkClass: (href: string, active?: boolean) => string;
  close: () => void;
  dragHandle?: React.ReactNode;
}

type Scope = { drive: string; folderPath: string | null };

/** The scope's own URL — where clearing the tag filter lands. */
function scopeHref(scope: Scope): string {
  const base = `/drive/${encodeURIComponent(scope.drive)}`;
  // The folder route decodes path segments individually
  // (app/drive/[name]/[...path]/page.tsx), so encoding the whole path in
  // one go would not round-trip a folder containing "/"-adjacent
  // characters or a non-ASCII name.
  const folder = scope.folderPath
    ? `/${scope.folderPath.split("/").map(encodeURIComponent).join("/")}`
    : "";
  return `${base}${folder}`;
}

function tagHref(scope: Scope, tagName: string): string {
  return `${scopeHref(scope)}?tag=${encodeURIComponent(tagName)}`;
}

export function SidebarTagsSection({
  drive,
  currentFolderPath,
  pathname,
  activeTag,
  activeView,
  tags,
  linkClass,
  close,
  dragHandle,
}: SidebarTagsSectionProps) {
  const t = useTranslations("sidebar");
  const { collapsed, toggle } = useSidebarSectionCollapsed("tags");
  const { mode, setMode } = useTagSortMode(drive ?? null);
  const [showAll, setShowAll] = useState(false);

  // Moving folders swaps the list out from under the expansion, so the
  // request to see everything does not survive the move — otherwise
  // one folder's "show all" silently unfolds the next folder's thirty.
  useEffect(() => {
    setShowAll(false);
  }, [drive, currentFolderPath]);

  if (!tags || tags.items.length === 0) return null;

  const { resolvedScope } = tags;
  // Links are live only while the rows on screen and the scope we are in
  // describe the same thing. During the in-flight window after a
  // navigation the previous scope's rows stay visible but inert — blanking
  // them instead would flicker on every folder navigation, and leaving
  // them live is the bug this whole design removes. Note that a stably
  // null folderPath (search / collections / addons / file detail) agrees
  // with a drive-wide fetch, so links keep working on those routes.
  const scopeMatches =
    resolvedScope.drive === drive && resolvedScope.folderPath === currentFolderPath;

  // Where clearing the tag filter lands, and — because it is the scope's
  // own page — the only place a row may claim to be selected.
  const clearHref = scopeHref(resolvedScope);
  const isOnScopePage = samePath(pathname, clearHref);
  // The server matches tags case-insensitively
  // (`func.lower(Tag.name) == tag.lower()`), so an exact comparison here
  // would filter the listing while showing nothing selected — and the
  // re-click-to-clear toggle would never engage.
  const activeTagKey = activeTag?.toLowerCase() ?? null;

  const sortedTags = sortTags(tags.items, mode);
  // The applied tag is always on screen, ranked or not.
  //
  // The fold is by count, so a rare tag is never in the first eight —
  // and arriving on `?tag=X` from the file detail's chips or from
  // "Search the whole drive" would then filter the listing while the
  // row that says so, and the second click that clears it, were both
  // folded away. This section is the only surface that shows an
  // applied tag or takes it off, so folding it away is a filter with
  // no exit.
  const foldedTags = sortedTags.slice(0, COLLAPSED_TAG_COUNT);
  const selectedOutsideFold =
    activeTagKey !== null && !activeView
      ? sortedTags.filter(
          (tag) =>
            tag.name.toLowerCase() === activeTagKey &&
            !foldedTags.some((shown) => shown.name === tag.name),
        )
      : [];
  const visibleTags = showAll ? sortedTags : [...foldedTags, ...selectedOutsideFold];
  const hiddenCount = sortedTags.length - visibleTags.length;
  const SortIcon = mode === "count" ? ArrowDown01 : ArrowDownAZ;
  const sortLabel = mode === "count" ? t("sort.byCount") : t("sort.byName");
  // Only the last segment: the heading is 239px wide, so a deep path
  // would wrap and push the rows down.
  const scopeFolder = resolvedScope.folderPath?.split("/").filter(Boolean).pop() ?? null;

  return (
    <>
      <SidebarSectionHeading
        label={scopeFolder ? t("tagsScoped", { folder: scopeFolder }) : t("tags")}
        collapsed={collapsed}
        onToggle={toggle}
        dragHandle={dragHandle}
        actions={
          <button
            type="button"
            onClick={() => setMode(mode === "count" ? "name" : "count")}
            aria-label={t("sort.toggle")}
            title={t("sort.toggle")}
            className="flex shrink-0 items-center gap-1 rounded-lg px-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
          >
            <SortIcon size={12} aria-hidden="true" />
            <span>{sortLabel}</span>
          </button>
        }
      />
      {!collapsed &&
        visibleTags.map((tag) => {
          // Both the highlight and the destination come from the tag
          // name, never from each other: a selected row links to the
          // scope without the tag, so an href-derived highlight would
          // vanish exactly when the row is selected.
          const isSelected =
            scopeMatches &&
            isOnScopePage &&
            !activeView &&
            activeTagKey === tag.name.toLowerCase();
          // Built from resolvedScope — the scope the visible items
          // actually came from — so a rendered row and its link cannot
          // describe different scopes, even mid-flight.
          const href = isSelected ? clearHref : tagHref(resolvedScope, tag.name);
          const body = (
            <>
              <Tag size={16} />
              <span className="flex-1 truncate">{tag.name}</span>
              <span className="text-xs opacity-60">{tag.count}</span>
            </>
          );
          return scopeMatches ? (
            <Link
              key={tag.name}
              href={href}
              onClick={close}
              title={isSelected ? t("clearTag") : undefined}
              aria-current={isSelected ? "true" : undefined}
              className={linkClass(href, isSelected)}
            >
              {body}
            </Link>
          ) : (
            <div
              key={tag.name}
              aria-disabled="true"
              className={`${linkClass(href, false)} pointer-events-none opacity-60`}
            >
              {body}
            </div>
          );
        })}
      {!collapsed && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <Tags size={16} />
          <span className="min-w-0 flex-1 truncate text-left">
            {t("allTags", { count: sortedTags.length })}
          </span>
        </button>
      )}
    </>
  );
}
