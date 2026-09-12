import Link from "next/link";
import { Clock, Download, FilePlus, Files, FolderTree, Home, NotebookPen, Package, Rss, Star, ThumbsUp, Warehouse, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { AddonSlot } from "@/components/AddonSlot";
import { addonUrlFor, type AddonMeta } from "@/lib/addons";
import type { Drive } from "@/types";
import { SidebarDriveSwitcher } from "./SidebarDriveSwitcher";
import { SidebarSectionHeading } from "./SidebarSectionHeading";

const ADDON_ICONS: Record<string, LucideIcon> = {
  download: Download,
  "notebook-pen": NotebookPen,
  package: Package,
  rss: Rss,
};

interface SidebarLibrarySectionProps {
  driveBase: string | null;
  currentDrive: string | null;
  /** Every drive this viewer may see; feeds the switcher at the top. */
  drives?: Drive[];
  linkClass: (href: string, active?: boolean) => string;
  close: () => void;
  addons?: Record<string, AddonMeta>;
  /**
   * Whether the Library row is the selected one. Passed rather than
   * derived from its href: Library is selected on folder URLs it does
   * not link to, and unselected on one it does. See
   * `libraryRowActive.ts`.
   */
  libraryActive: boolean;
}

export function SidebarLibrarySection({ driveBase, currentDrive, drives = [], linkClass, close, addons, libraryActive }: SidebarLibrarySectionProps) {
  const t = useTranslations("sidebar");

  const addonEntries = addons
    ? Object.entries(addons)
        .map(([name, meta]) => ({ name, meta, href: addonUrlFor(name, meta, currentDrive) }))
        .filter((entry): entry is { name: string; meta: AddonMeta; href: string } => entry.href !== null)
    : [];

  return (
    <>
      <div className="mb-2 py-2 pr-3 pl-12">
        <Link href="/" onClick={close} className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Warehouse size={20} className="text-text-muted" />
          Litloft
        </Link>
      </div>

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
            <Clock size={16} />
            {t("recentPlay")}
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

      {addonEntries.length > 0 && (
        <>
          <SidebarSectionHeading label={t("addons")} />
          {addonEntries.map(({ name, meta, href }) => {
            const Icon = ADDON_ICONS[meta.icon] ?? Package;
            return (
              <Link key={name} href={href} onClick={close} className={linkClass(href)}>
                <Icon size={16} />
                {meta.label}
              </Link>
            );
          })}
        </>
      )}

      <AddonSlot id="sidebar-sections" layout="stack" />
    </>
  );
}
