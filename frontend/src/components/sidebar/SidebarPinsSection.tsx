import type React from "react";
import { useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { useTranslations } from "next-intl";

import type { PinnedFolder } from "@/types";
import { useSidebarSectionCollapsed } from "./useSidebarSectionCollapsed";
import { useSidebarItemOrder } from "./useSidebarItemOrder";
import { useReorderableDnD } from "./useReorderableDnD";
import { ItemDragHandle } from "./ItemDragHandle";

interface SidebarPinsSectionProps {
  driveBase: string;
  drive?: string | null;
  pins: PinnedFolder[];
  linkClass: (href: string) => string;
  close: () => void;
  dragHandle?: React.ReactNode;
}

export function SidebarPinsSection({
  driveBase,
  drive,
  pins,
  linkClass,
  close,
  dragHandle,
}: SidebarPinsSectionProps) {
  const t = useTranslations("sidebar");
  const { collapsed, toggle } = useSidebarSectionCollapsed("pins");

  // Stable id list (pin.path). Memoised so the reorder hooks keep a steady
  // reference and do not churn `order` identity on every render.
  const currentIds = useMemo(() => pins.map((p) => p.path), [pins]);
  const { order, setOrder } = useSidebarItemOrder("pins", drive ?? null, currentIds);
  const itemDnd = useReorderableDnD({
    kind: "sidebar-item-pins",
    ids: order,
    onReorder: setOrder,
  });

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
        order.map((id) => {
          const pin = pins.find((p) => p.path === id);
          if (!pin) return null;
          const pinHref = `${driveBase}/${pin.path.split("/").map(encodeURIComponent).join("/")}`;
          const pinName = pin.path.split("/").pop() ?? pin.path;
          return (
            <div
              key={pin.path}
              className="relative flex items-center"
              {...itemDnd.getRowProps(pin.path)}
            >
              {itemDnd.dropTarget?.id === pin.path && (
                <div
                  className="pointer-events-none absolute inset-x-2 h-0.5 bg-accent z-10"
                  style={{
                    [itemDnd.dropTarget.position === "before" ? "top" : "bottom"]: 0,
                  }}
                />
              )}
              <ItemDragHandle {...itemDnd.getHandleProps(pin.path)} />
              <Link
                href={pinHref}
                onClick={close}
                className={`flex-1 ${linkClass(pinHref)}`}
              >
                <Folder size={16} />
                <span className="flex-1 truncate">{pinName}</span>
              </Link>
            </div>
          );
        })}
    </>
  );
}
