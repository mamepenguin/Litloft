"use client";

import Link from "next/link";
import {
  Folder,
  FolderTree,
  Inbox,
  Library,
  ListFilter,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import type { AddonNavEntry } from "@/lib/addonNavigation";
import { ADDON_NAV_ICONS } from "@/lib/addonNavIcons";
import { builtinApps } from "@/lib/builtinApps";
import { collectionHref, driveHref, smartFolderHref } from "@/lib/driveViews";
import { pinHrefFor } from "@/components/sidebar/libraryRowActive";
import { slotEntryLabel } from "@/lib/slotLabel";
import type { HomeShortcut } from "@/types";

interface HomeAppEntriesProps {
  drive: string;
  addonEntries: readonly AddonNavEntry[];
  inboxCount: number;
  shortcuts: readonly HomeShortcut[];
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
  "relative flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl bg-bg-elevated px-1 py-3 text-center text-xs leading-tight text-text-primary transition-colors hover:bg-sand",
  "@min-[36rem]:inline-flex @min-[36rem]:max-w-[16rem] @min-[36rem]:min-h-11 @min-[36rem]:flex-row @min-[36rem]:gap-2.5 @min-[36rem]:px-4 @min-[36rem]:py-3 @min-[36rem]:text-left @min-[36rem]:text-sm @min-[36rem]:font-medium @min-[36rem]:leading-normal",
].join(" ");

const TILE_ICON =
  "h-[22px] w-[22px] shrink-0 @min-[36rem]:h-[18px] @min-[36rem]:w-[18px]";

/**
 * `line-clamp` only works with `display: -webkit-box`, and the wrapping row
 * overrides it with `block`; `truncate` is what limits the label there.
 */
const TILE_LABEL =
  "min-w-0 line-clamp-2 @min-[36rem]:block @min-[36rem]:truncate";

const COUNT_PILL =
  "absolute right-2 top-1.5 min-w-5 rounded-full bg-warm-light px-1.5 text-center text-xs leading-5 text-text-primary @min-[36rem]:static";

function shortcutHref(drive: string, shortcut: HomeShortcut): string {
  if (shortcut.kind === "smart_folder") {
    return smartFolderHref({
      drive,
      id: shortcut.id,
      query: shortcut.query ?? "",
      file_type: shortcut.file_type,
    });
  }
  if (shortcut.kind === "pin") {
    return pinHrefFor(`/drive/${encodeURIComponent(drive)}`, shortcut.id);
  }
  return collectionHref({ drive, id: shortcut.id });
}

const SHORTCUT_ICONS: Record<HomeShortcut["kind"], LucideIcon> = {
  smart_folder: ListFilter,
  pin: Folder,
  collection: Library,
};

export function HomeAppEntries({
  drive,
  addonEntries,
  inboxCount,
  shortcuts,
}: HomeAppEntriesProps) {
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
    ...addonEntries.map(({ key, navigation, href }) => ({
      key,
      href,
      label: slotEntryLabel(navigation, tRoot),
      icon: (navigation.icon && ADDON_NAV_ICONS[navigation.icon]) || Package,
    })),
    ...shortcuts.map((shortcut) => ({
      key: `shortcut:${shortcut.kind}:${shortcut.id}`,
      href: shortcutHref(drive, shortcut),
      label: shortcut.name,
      icon: SHORTCUT_ICONS[shortcut.kind],
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
            <span className={TILE_LABEL}>{label}</span>
            {count && <span className={COUNT_PILL}>{count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
