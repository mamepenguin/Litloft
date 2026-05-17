import type React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { useTranslations } from "next-intl";

import type { PinnedFolder } from "@/types";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";

interface SidebarPinsSectionProps {
  driveBase: string;
  pins: PinnedFolder[];
  linkClass: (href: string) => string;
  close: () => void;
  dragHandle?: React.ReactNode;
}

export function SidebarPinsSection({ driveBase, pins, linkClass, close, dragHandle }: SidebarPinsSectionProps) {
  const t = useTranslations("sidebar");
  const { collapsed, toggle } = useSidebarSectionCollapsed("pins");

  if (pins.length === 0) return null;

  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <>
      <div className="mb-1 mt-4 flex items-center gap-1 pl-1 pr-3">
        {dragHandle}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("sectionExpand") : t("sectionCollapse")}
          className="flex flex-1 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
        >
          <Chevron size={12} />
          <span>Pins</span>
        </button>
      </div>
      {!collapsed &&
        pins.map((pin) => {
          const pinHref = `${driveBase}/${pin.path.split("/").map(encodeURIComponent).join("/")}`;
          const pinName = pin.path.split("/").pop() ?? pin.path;
          return (
            <Link
              key={pin.path}
              href={pinHref}
              onClick={close}
              className={linkClass(pinHref)}
            >
              <Folder size={16} />
              <span className="flex-1 truncate">{pinName}</span>
            </Link>
          );
        })}
    </>
  );
}
