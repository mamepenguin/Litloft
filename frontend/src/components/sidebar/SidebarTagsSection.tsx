import Link from "next/link";
import { ChevronDown, ChevronRight, Tag } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Tag as TagType } from "@/types";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";

interface SidebarTagsSectionProps {
  driveBase: string;
  tags: TagType[];
  linkClass: (href: string) => string;
  close: () => void;
}

export function SidebarTagsSection({ driveBase, tags, linkClass, close }: SidebarTagsSectionProps) {
  const t = useTranslations("sidebar");
  const { collapsed, toggle } = useSidebarSectionCollapsed("tags");

  if (tags.length === 0) return null;

  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("sectionExpand") : t("sectionCollapse")}
        className="mb-1 mt-4 flex w-full items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
      >
        <Chevron size={12} />
        <span>Tags</span>
      </button>
      {!collapsed &&
        tags.map((tag) => (
          <Link
            key={tag.name}
            href={`${driveBase}?tag=${encodeURIComponent(tag.name)}`}
            onClick={close}
            className={linkClass(`${driveBase}?tag=${encodeURIComponent(tag.name)}`)}
          >
            <Tag size={16} />
            <span className="flex-1 truncate">{tag.name}</span>
            <span className="text-xs opacity-60">{tag.count}</span>
          </Link>
        ))}
    </>
  );
}
