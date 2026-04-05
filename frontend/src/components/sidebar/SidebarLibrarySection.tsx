import Link from "next/link";
import {
  Clock,
  Download,
  FilePlus,
  Files,
  Gauge,
  Home,
  Package,
  Rss,
  Star,
  Trash2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AddonMeta } from "@/lib/addons";

const ADDON_ICONS: Record<string, LucideIcon> = {
  download: Download,
  package: Package,
  rss: Rss,
};

interface SidebarLibrarySectionProps {
  driveBase: string | null;
  linkClass: (href: string) => string;
  close: () => void;
  addons?: Record<string, AddonMeta>;
}

export function SidebarLibrarySection({ driveBase, linkClass, close, addons }: SidebarLibrarySectionProps) {
  const t = useTranslations("sidebar");
  const tAdmin = useTranslations("admin");

  const addonEntries = addons ? Object.entries(addons) : [];

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
          {addonEntries.map(([name, meta]) => {
            const Icon = ADDON_ICONS[meta.icon] ?? Package;
            return (
              <Link key={name} href={meta.href} onClick={close} className={linkClass(meta.href)}>
                <Icon size={16} />
                {meta.label}
              </Link>
            );
          })}
        </>
      )}
    </>
  );
}
