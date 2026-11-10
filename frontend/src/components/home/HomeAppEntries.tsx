"use client";

import Link from "next/link";
import { FolderTree, Inbox, Package, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AddonNavEntry } from "@/lib/addonNavigation";
import { ADDON_NAV_ICONS } from "@/lib/addonNavIcons";
import { builtinApps } from "@/lib/builtinApps";
import { driveHref } from "@/lib/driveViews";
import { slotEntryLabel } from "@/lib/slotLabel";

interface HomeAppEntriesProps {
  drive: string;
  addonEntries: readonly AddonNavEntry[];
  inboxCount: number;
}

interface Entry {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Set only on the Inbox entry, whose number is part of the link's name. */
  count?: string;
}

/**
 * The row is a container query, not a viewport breakpoint: the same component
 * sits at every width and decides from the room it was given.
 */
const TILE = [
  "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl bg-bg-elevated px-1 py-3 text-center text-xs leading-tight text-text-primary transition-colors hover:bg-sand",
  "@min-[36rem]:inline-flex @min-[36rem]:min-h-11 @min-[36rem]:flex-row @min-[36rem]:gap-2.5 @min-[36rem]:px-4 @min-[36rem]:py-3 @min-[36rem]:text-left @min-[36rem]:text-sm @min-[36rem]:font-medium @min-[36rem]:leading-normal",
].join(" ");

const TILE_ICON =
  "h-[22px] w-[22px] shrink-0 @min-[36rem]:h-[18px] @min-[36rem]:w-[18px]";

const COUNT_PILL =
  "absolute right-2 top-1.5 min-w-5 rounded-full bg-warm-light px-1.5 text-center text-xs leading-5 text-text-primary @min-[36rem]:static";

export function HomeAppEntries({ drive, addonEntries, inboxCount }: HomeAppEntriesProps) {
  const t = useTranslations("drive");
  const tSidebar = useTranslations("sidebar");
  const tRoot = useTranslations();
  const driveBase = `/drive/${encodeURIComponent(drive)}`;

  const entries: Entry[] = [
    {
      key: "library",
      href: driveHref(drive, "library"),
      label: tSidebar("library"),
      icon: FolderTree,
    },
    ...builtinApps.map((app) => ({
      key: app.id,
      href: app.route(drive),
      label: tRoot(app.labelKey),
      icon: app.icon,
    })),
    ...addonEntries.map(({ name, navigation, href }) => ({
      key: name,
      href,
      label: slotEntryLabel(navigation, tRoot),
      icon: (navigation.icon && ADDON_NAV_ICONS[navigation.icon]) || Package,
    })),
  ];

  if (inboxCount >= 1) {
    entries.push({
      key: "inbox",
      href: `${driveBase}?view=inbox`,
      label: tSidebar("inbox"),
      icon: Inbox,
      count: inboxCount > 99 ? "99+" : String(inboxCount),
    });
  }

  return (
    <div className="@container">
      <nav
        aria-label={t("appsNav")}
        className="grid grid-cols-4 gap-2 @min-[36rem]:flex @min-[36rem]:flex-wrap"
      >
        {entries.map(({ key, href, label, icon: Icon, count }) => (
          <Link key={key} href={href} className={TILE}>
            <Icon size={22} className={TILE_ICON} />
            {label}
            {count && <span className={COUNT_PILL}>{count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
