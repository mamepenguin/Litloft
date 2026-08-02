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

import type { Tag as TagType } from "@/types";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";
import { sortTags, useTagSortMode } from "./useTagSortMode";

interface SidebarTagsSectionProps {
  driveBase: string;
  drive?: string | null;
  tags: TagType[];
  linkClass: (href: string) => string;
  close: () => void;
  dragHandle?: React.ReactNode;
}

export function SidebarTagsSection({
  driveBase,
  drive,
  tags,
  linkClass,
  close,
  dragHandle,
}: SidebarTagsSectionProps) {
  const t = useTranslations("sidebar");
  const { collapsed, toggle } = useSidebarSectionCollapsed("tags");
  const { mode, setMode } = useTagSortMode(drive ?? null);

  if (tags.length === 0) return null;

  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const sortedTags = sortTags(tags, mode);
  const SortIcon = mode === "count" ? ArrowDown01 : ArrowDownAZ;
  const sortLabel = mode === "count" ? t("sort.byCount") : t("sort.byName");
  // Tag links always point at the drive root, not the current folder:
  // list_drive_files' `path` filter is an exact match while file browsing
  // by tag needs a subtree match, and the file-listing API doesn't support
  // that combination yet (see hako review finding H1, 2026-08-02).

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
          const href = `${driveBase}?tag=${encodeURIComponent(tag.name)}`;
          return (
            <Link
              key={tag.name}
              href={href}
              onClick={close}
              className={linkClass(href)}
            >
              <Tag size={16} />
              <span className="flex-1 truncate">{tag.name}</span>
              <span className="text-xs opacity-60">{tag.count}</span>
            </Link>
          );
        })}
    </>
  );
}
