"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AddonNavEntry } from "@/lib/addonNavigation";
import { ADDON_NAV_ICONS } from "@/lib/addonNavIcons";
import { slotEntryLabel } from "@/lib/slotLabel";

export function AddonNavRows({
  entries,
  linkClass,
  close,
  activeKey = null,
}: {
  entries: readonly AddonNavEntry[];
  linkClass: (href: string, active?: boolean) => string;
  close: () => void;
  /** The one entry lit, decided across every placement. */
  activeKey?: string | null;
}) {
  const t = useTranslations();

  return (
    <>
      {entries.map(({ key, navigation, href }) => {
        const Icon = (navigation.icon && ADDON_NAV_ICONS[navigation.icon]) || Package;
        return (
          <Link
            key={key}
            href={href}
            onClick={close}
            className={linkClass(href, key === activeKey)}
          >
            <Icon size={16} />
            {slotEntryLabel(navigation, t)}
          </Link>
        );
      })}
    </>
  );
}
