"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AddonNavEntry } from "@/lib/addonNavigation";
import { ADDON_NAV_ICONS } from "@/lib/addonNavIcons";
import { EMPTY_HIDDEN_KEYS, isEntryShown } from "@/lib/entryVisibility";
import { slotEntryLabel } from "@/lib/slotLabel";

export function AddonNavRows({
  entries,
  linkClass,
  close,
  activeKey = null,
  hiddenKeys = EMPTY_HIDDEN_KEYS,
}: {
  entries: readonly AddonNavEntry[];
  linkClass: (href: string, active?: boolean) => string;
  close: () => void;
  /** The one entry lit, decided across every placement. */
  activeKey?: string | null;
  /** The drive's hidden entry keys; `null` while that list is loading. */
  hiddenKeys?: ReadonlySet<string> | null;
}) {
  const t = useTranslations();

  return (
    <>
      {entries.filter(({ key }) => isEntryShown(key, hiddenKeys)).map(({ key, navigation, href }) => {
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
