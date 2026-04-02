import Link from "next/link";
import { Clock, FilePlus, Files, Home, Star, Warehouse } from "lucide-react";
import { useTranslations } from "next-intl";

interface SidebarLibrarySectionProps {
  driveBase: string | null;
  linkClass: (href: string) => string;
  close: () => void;
}

export function SidebarLibrarySection({ driveBase, linkClass, close }: SidebarLibrarySectionProps) {
  const t = useTranslations("sidebar");
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
        </>
      )}
    </>
  );
}
