import type React from "react";
import Link from "next/link";
import {
  ArrowDown01,
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { ScopedTags } from "./useSidebarData";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";
import { sortTags, useTagSortMode } from "./useTagSortMode";

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
  tags: ScopedTags | null;
  linkClass: (href: string) => string;
  close: () => void;
  dragHandle?: React.ReactNode;
}

/** Build a folder URL, encoding each segment separately. */
function tagHref(
  scope: { drive: string; folderPath: string | null },
  tagName: string,
): string {
  const base = `/drive/${encodeURIComponent(scope.drive)}`;
  // The folder route decodes path segments individually
  // (app/drive/[name]/[...path]/page.tsx), so encoding the whole path in
  // one go would not round-trip a folder containing "/"-adjacent
  // characters or a non-ASCII name.
  const folder = scope.folderPath
    ? `/${scope.folderPath.split("/").map(encodeURIComponent).join("/")}`
    : "";
  return `${base}${folder}?tag=${encodeURIComponent(tagName)}`;
}

export function SidebarTagsSection({
  drive,
  currentFolderPath,
  tags,
  linkClass,
  close,
  dragHandle,
}: SidebarTagsSectionProps) {
  const t = useTranslations("sidebar");
  const { collapsed, toggle } = useSidebarSectionCollapsed("tags");
  const { mode, setMode } = useTagSortMode(drive ?? null);

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

  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const sortedTags = sortTags(tags.items, mode);
  const SortIcon = mode === "count" ? ArrowDown01 : ArrowDownAZ;
  const sortLabel = mode === "count" ? t("sort.byCount") : t("sort.byName");

  return (
    <>
      <div className="group relative mb-1 mt-4 flex items-center justify-between pr-3">
        {dragHandle}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("sectionExpand") : t("sectionCollapse")}
          className="flex flex-1 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          <Chevron size={12} />
          <span>Tags</span>
        </button>
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
      </div>
      {!collapsed &&
        sortedTags.map((tag) => {
          // Built from resolvedScope — the scope the visible items
          // actually came from — so a rendered row and its link cannot
          // describe different scopes, even mid-flight.
          const href = tagHref(resolvedScope, tag.name);
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
              className={linkClass(href)}
            >
              {body}
            </Link>
          ) : (
            <div
              key={tag.name}
              aria-disabled="true"
              className={`${linkClass(href)} pointer-events-none opacity-60`}
            >
              {body}
            </div>
          );
        })}
    </>
  );
}
