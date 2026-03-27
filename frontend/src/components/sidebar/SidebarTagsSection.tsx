import Link from "next/link";
import { Tag } from "lucide-react";

import type { Tag as TagType } from "@/types";

interface SidebarTagsSectionProps {
  driveBase: string;
  tags: TagType[];
  linkClass: (href: string) => string;
  close: () => void;
}

export function SidebarTagsSection({ driveBase, tags, linkClass, close }: SidebarTagsSectionProps) {
  if (tags.length === 0) return null;

  return (
    <>
      <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Tags
      </div>
      {tags.map((t) => (
        <Link
          key={t.name}
          href={`${driveBase}?tag=${encodeURIComponent(t.name)}`}
          onClick={close}
          className={linkClass(`${driveBase}?tag=${encodeURIComponent(t.name)}`)}
        >
          <Tag size={16} />
          <span className="flex-1 truncate">{t.name}</span>
          <span className="text-xs opacity-60">{t.count}</span>
        </Link>
      ))}
    </>
  );
}
