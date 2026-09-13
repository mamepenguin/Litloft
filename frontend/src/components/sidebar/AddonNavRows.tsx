"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Download,
  MessageCircleQuestion,
  NotebookPen,
  Package,
  Rss,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { AddonNavEntry } from "@/lib/addonNavigation";
import { slotEntryLabel } from "@/lib/slotLabel";
import { isAddonNavRowActive } from "./isSidebarLinkActive";

export const ADDON_NAV_ICONS: Record<string, LucideIcon> = {
  download: Download,
  "message-circle-question": MessageCircleQuestion,
  "notebook-pen": NotebookPen,
  package: Package,
  rss: Rss,
};

export function AddonNavRows({
  entries,
  linkClass,
  close,
}: {
  entries: readonly AddonNavEntry[];
  linkClass: (href: string, active?: boolean) => string;
  close: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname() ?? "";

  return (
    <>
      {entries.map(({ name, navigation, href }) => {
        const Icon = (navigation.icon && ADDON_NAV_ICONS[navigation.icon]) || Package;
        return (
          <Link
            key={name}
            href={href}
            onClick={close}
            className={linkClass(href, isAddonNavRowActive(pathname, href))}
          >
            <Icon size={16} />
            {slotEntryLabel(navigation, t)}
          </Link>
        );
      })}
    </>
  );
}
