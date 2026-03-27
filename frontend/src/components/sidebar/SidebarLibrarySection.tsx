import Link from "next/link";
import { Clock, FilePlus, Files, Home, Star, Warehouse } from "lucide-react";

interface SidebarLibrarySectionProps {
  driveBase: string | null;
  linkClass: (href: string) => string;
  close: () => void;
}

export function SidebarLibrarySection({ driveBase, linkClass, close }: SidebarLibrarySectionProps) {
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
        ホーム
      </Link>
      {driveBase && (
        <>
          <Link href={`${driveBase}?view=favorites`} onClick={close} className={linkClass(`${driveBase}?view=favorites`)}>
            <Star size={16} />
            お気に入り
          </Link>
          <Link href={`${driveBase}?view=recent`} onClick={close} className={linkClass(`${driveBase}?view=recent`)}>
            <Clock size={16} />
            最近再生
          </Link>
          <Link href={`${driveBase}?view=recent-added`} onClick={close} className={linkClass(`${driveBase}?view=recent-added`)}>
            <FilePlus size={16} />
            最近追加
          </Link>
          <Link href={`${driveBase}?view=all`} onClick={close} className={linkClass(`${driveBase}?view=all`)}>
            <Files size={16} />
            すべてのファイル
          </Link>
        </>
      )}
    </>
  );
}
