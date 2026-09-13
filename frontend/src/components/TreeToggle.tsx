"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";

import { useTreeVisible } from "@/hooks/useTreeVisible";
import { routeHidesTree } from "@/lib/driveViews";

interface TreeToggleProps {
  drive: string;
  visible?: boolean;
}

export function TreeToggle({ drive, visible = true }: TreeToggleProps) {
  const t = useTranslations("view");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The effective state, not the stored one. Below `md` a stored "on" is
  // suppressed.
  const { visible: treeVisible, toggle } = useTreeVisible(drive);

  if (!visible) return null;
  if (routeHidesTree({ pathname, view: searchParams.get("view") })) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={treeVisible}
      aria-label={treeVisible ? t("treeOff") : t("treeOn")}
      title={treeVisible ? t("treeOff") : t("treeOn")}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-bg-elevated hover:text-text-primary ${
        treeVisible ? "bg-bg-elevated text-text-primary" : "text-text-muted"
      }`}
    >
      {treeVisible ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
    </button>
  );
}
