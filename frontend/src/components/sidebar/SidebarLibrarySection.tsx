import Link from "next/link";
import { FilePlus, Files, FolderTree, History, Home, Star, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { AddonSlot } from "@/components/AddonSlot";
import type { AddonNavEntry } from "@/lib/addonNavigation";
import type { Drive } from "@/types";
import { AddonNavRows } from "./AddonNavRows";
import { SidebarDriveSwitcher } from "./SidebarDriveSwitcher";
import { SidebarSectionHeading } from "./SidebarSectionHeading";

interface SidebarLibrarySectionProps {
  driveBase: string | null;
  currentDrive: string | null;
  /** Every drive this viewer may see; feeds the switcher at the top. */
  drives?: Drive[];
  linkClass: (href: string, active?: boolean) => string;
  close: () => void;
  primaryAddons?: readonly AddonNavEntry[];
  sourceAddons?: readonly AddonNavEntry[];
  /**
   * Whether the Library row is the selected one. Passed rather than
   * derived from its href: Library is selected on folder URLs it does
   * not link to, and unselected on one it does. See
   * `libraryRowActive.ts`.
   */
  libraryActive: boolean;
}

export function SidebarLibrarySection({ driveBase, currentDrive, drives = [], linkClass, close, primaryAddons = [], sourceAddons = [], libraryActive }: SidebarLibrarySectionProps) {
  const t = useTranslations("sidebar");

  return (
    <>
      {/* Where the fixed menu and tree buttons sit. Empty, so without
          `shrink-0` the scrolling column squeezes it to nothing. */}
      <div aria-hidden="true" data-testid="sidebar-button-row" className="mb-2 h-10 shrink-0" />

      <SidebarDriveSwitcher drives={drives} currentDrive={currentDrive} close={close} />

      <Link href={driveBase ?? "/"} onClick={close} className={linkClass(driveBase ?? "/")}>
        <Home size={16} />
        {t("home")}
      </Link>
      {driveBase && (
        <>
          <Link href={`${driveBase}?view=library`} onClick={close} className={linkClass(`${driveBase}?view=library`, libraryActive)}>
            <FolderTree size={16} />
            {t("library")}
          </Link>
        </>
      )}
      <AddonNavRows entries={primaryAddons} linkClass={linkClass} close={close} />
      {driveBase && (
        <>
          {/* What the heading names: each row under it is the whole
              drive seen through one question, where Library is the drive
              seen through its folders. They are pages in their own
              right, not tabs inside Library. Grouping them keeps the
              rows above the heading to the ones you go to on purpose. */}
          <SidebarSectionHeading label={t("views")} />
          <Link href={`${driveBase}?view=favorites`} onClick={close} className={linkClass(`${driveBase}?view=favorites`)}>
            <Star size={16} />
            {t("favorites")}
          </Link>
          <Link href={`${driveBase}?view=liked`} onClick={close} className={linkClass(`${driveBase}?view=liked`)}>
            <ThumbsUp size={16} />
            {t("liked")}
          </Link>
          <Link href={`${driveBase}?view=recent`} onClick={close} className={linkClass(`${driveBase}?view=recent`)}>
            <History size={16} />
            {t("recentlyViewed")}
          </Link>
          <Link href={`${driveBase}?view=recent-added`} onClick={close} className={linkClass(`${driveBase}?view=recent-added`)}>
            <FilePlus size={16} />
            {t("recentAdded")}
          </Link>
          <Link href={`${driveBase}?view=all`} onClick={close} className={linkClass(`${driveBase}?view=all`)}>
            <Files size={16} />
            {t("allFiles")}
          </Link>
        </>
      )}

      {sourceAddons.length > 0 && (
        <>
          <SidebarSectionHeading label={t("sources")} />
          <AddonNavRows entries={sourceAddons} linkClass={linkClass} close={close} />
        </>
      )}

      <AddonSlot id="sidebar-sections" layout="stack" />
    </>
  );
}
