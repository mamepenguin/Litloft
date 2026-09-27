"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, Library, Package, Search, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { ADDON_NAV_ICONS } from "@/components/sidebar/AddonNavRows";
import { pinHrefFor } from "@/components/sidebar/libraryRowActive";
import { addonNavEntries, type AddonNavPlacement } from "@/lib/addonNavigation";
import {
  getAuthStatus,
  getCollections,
  getDriveSummary,
  getFolderTree,
  getPins,
  getSmartFolders,
} from "@/lib/api";
import { collectionHref, smartFolderHref } from "@/lib/driveViews";
import {
  folderJumpKey,
  indexFolders,
  visibleFixedJumps,
  type IndexedFolder,
} from "@/lib/pageJump";
import { slotEntryLabel } from "@/lib/slotLabel";
import type { CollectionSummary, PinnedFolder } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

export interface JumpDestination {
  key: string;
  label: string;
  names: readonly string[];
  href: string;
  icon: LucideIcon;
  /** Set for a collection, whose sidebar row pins the drive before navigating. */
  overrideDrive?: string;
  /** A second, muted line of context, e.g. a folder's parent path. */
  detail?: string;
}

const NO_PINS: PinnedFolder[] = [];
const NO_COLLECTIONS: CollectionSummary[] = [];
const NO_SMART_FOLDERS: SmartFolder[] = [];
const PLACEMENTS: readonly AddonNavPlacement[] = ["primary", "sources", "utility"];

const NO_FOLDERS: IndexedFolder[] = [];

const loadMissingCount = (drive: string) =>
  getDriveSummary(drive).then((summary) => summary.missing_count);

const loadFolders = (drive: string) =>
  getFolderTree(drive, { flat: true }).then(indexFolders);

/**
 * The value is kept with the drive it was loaded for and is only returned
 * while that is still the current drive, so a drive switch hides the previous
 * drive's rows before the new request answers.
 */
function useDriveOwned<T>(
  load: (drive: string) => Promise<T>,
  active: boolean,
  drive: string | null,
  empty: T,
): T {
  const [loaded, setLoaded] = useState<{ drive: string; value: T } | null>(null);

  useEffect(() => {
    if (!active || !drive) return;
    let cancelled = false;
    load(drive)
      .then((value) => {
        if (!cancelled) setLoaded({ drive, value });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ drive, value: empty });
      });
    return () => {
      cancelled = true;
    };
  }, [load, active, drive, empty]);

  return loaded && loaded.drive === drive ? loaded.value : empty;
}

function useIsAdmin(active: boolean): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getAuthStatus()
      .then((status) => {
        if (!cancelled) setIsAdmin(status.is_admin === true);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);
  return isAdmin;
}

/** Aliases are one comma-separated message, so the message tree stays all strings. */
function aliases(text: string): string[] {
  return text.split(",").map((alias) => alias.trim()).filter(Boolean);
}

/** In match order: fixed pages, addons, pins, collections, smart folders. */
export function useJumpDestinations(active: boolean, drive: string | null): JumpDestination[] {
  const t = useTranslations();
  const pins = useDriveOwned(getPins, active, drive, NO_PINS);
  const collections = useDriveOwned(getCollections, active, drive, NO_COLLECTIONS);
  const smartFolders = useDriveOwned(getSmartFolders, active, drive, NO_SMART_FOLDERS);
  const missingCount = useDriveOwned(loadMissingCount, active, drive, 0);
  const isAdmin = useIsAdmin(active);
  const { addons, catalogueDrive } = useAddonSlots();

  return useMemo(() => {
    if (!drive) return [];
    const driveBase = `/drive/${encodeURIComponent(drive)}`;

    const fixed = visibleFixedJumps({ missingCount, isAdmin }).map<JumpDestination>((jump) => {
      const label = t(jump.labelKey);
      return {
        key: `fixed:${jump.key}`,
        label,
        names: [label, ...aliases(t(`pageJump.aliases.${jump.key}`))],
        href: jump.href(drive),
        icon: jump.icon,
      };
    });

    const catalogue = catalogueDrive === drive ? addons : {};
    const addonRows = PLACEMENTS.flatMap((placement) =>
      addonNavEntries(catalogue, drive, placement),
    ).map<JumpDestination>(({ name, navigation, href }) => {
      const label = slotEntryLabel(navigation, t);
      return {
        key: `addon:${name}`,
        label,
        names: [label, navigation.label],
        href,
        icon: (navigation.icon && ADDON_NAV_ICONS[navigation.icon]) || Package,
      };
    });

    const pinRows = pins.map<JumpDestination>((pin) => {
      const label = pin.path.split("/").pop() ?? pin.path;
      return {
        key: folderJumpKey(pin.path),
        label,
        names: [label],
        href: pinHrefFor(driveBase, pin.path),
        icon: Folder,
      };
    });

    const collectionRows = collections.map<JumpDestination>((collection) => ({
      key: `collection:${collection.id}`,
      label: collection.name,
      names: [collection.name],
      href: collectionHref(collection),
      icon: Library,
      overrideDrive: collection.drive,
    }));

    const smartRows = smartFolders.map<JumpDestination>((folder) => ({
      key: `smart:${folder.id}`,
      label: folder.name,
      names: [folder.name],
      href: smartFolderHref(folder),
      icon: Search,
    }));

    return [...fixed, ...addonRows, ...pinRows, ...collectionRows, ...smartRows];
  }, [t, drive, missingCount, isAdmin, addons, catalogueDrive, pins, collections, smartFolders]);
}

/** Every folder of the drive, indexed for matching. */
export function useJumpFolders(active: boolean, drive: string | null): IndexedFolder[] {
  return useDriveOwned(loadFolders, active, drive, NO_FOLDERS);
}
