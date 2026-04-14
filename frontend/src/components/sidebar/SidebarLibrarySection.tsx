import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Download,
  FilePlus,
  Files,
  Gauge,
  Home,
  NotebookPen,
  Package,
  Rss,
  Star,
  Trash2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { AddonSlot } from "@/components/AddonSlot";
import { addonUrlFor, type AddonMeta } from "@/lib/addons";
import type { DriveSummary } from "@/types";

const ADDON_ICONS: Record<string, LucideIcon> = {
  download: Download,
  "notebook-pen": NotebookPen,
  package: Package,
  rss: Rss,
};

interface SidebarLibrarySectionProps {
  driveBase: string | null;
  currentDrive: string | null;
  linkClass: (href: string) => string;
  close: () => void;
  addons?: Record<string, AddonMeta>;
  driveSummary?: DriveSummary | null;
}

export function SidebarLibrarySection({ driveBase, currentDrive, linkClass, close, addons, driveSummary }: SidebarLibrarySectionProps) {
  const t = useTranslations("sidebar");
  const tMissing = useTranslations("missing");
  const tAdmin = useTranslations("admin");

  const addonEntries = addons
    ? Object.entries(addons)
        .map(([name, meta]) => ({ name, meta, href: addonUrlFor(name, meta, currentDrive) }))
        .filter((entry): entry is { name: string; meta: AddonMeta; href: string } => entry.href !== null)
    : [];

  return (
    <>
      <div className="mb-2 px-3 py-2">
        <Link href="/" onClick={close} className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Warehouse size={20} className="text-accent-cta" />
          HomeVault
        </Link>
      </div>

      <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Library
      </div>
      <Link href={driveBase ?? "/"} onClick={close} className={linkClass(driveBase ?? "/")}>
        <Home size={16} />
        {t("home")}
      </Link>
      {driveBase && (
        <>
          <Link href={`${driveBase}?view=favorites`} onClick={close} className={linkClass(`${driveBase}?view=favorites`)}>
            <Star size={16} />
            {t("favorites")}
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
          <Link href={`${driveBase}?view=trash`} onClick={close} className={linkClass(`${driveBase}?view=trash`)}>
            <Trash2 size={16} />
            {t("trash")}
          </Link>
          {driveSummary && driveSummary.missing_count > 0 && (
            <Link href={`${driveBase}?view=missing`} onClick={close} className={linkClass(`${driveBase}?view=missing`)}>
              <AlertTriangle size={16} className="text-warm-silver" />
              <span className="flex-1">{tMissing("sidebar")}</span>
              <span className="flex-shrink-0 rounded-full bg-warm-silver/20 px-1.5 py-0.5 text-[10px] font-semibold text-warm-silver">
                {driveSummary.missing_count}
              </span>
            </Link>
          )}
        </>
      )}
      <Link href="/admin" onClick={close} className={linkClass("/admin")}>
        <Gauge size={16} />
        {tAdmin("title")}
      </Link>

      {addonEntries.length > 0 && (
        <>
          <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Addons
          </div>
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
