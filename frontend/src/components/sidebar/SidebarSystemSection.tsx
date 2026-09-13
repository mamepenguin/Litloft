import Link from "next/link";
import { AlertTriangle, Gauge, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DriveSummary } from "@/types";
import { SidebarSectionHeading } from "./SidebarSectionHeading";

interface SidebarSystemSectionProps {
  driveBase: string | null;
  linkClass: (href: string, active?: boolean) => string;
  close: () => void;
  driveSummary?: DriveSummary | null;
  /**
   * The dashboard link points at admin-only surfaces, so it is rendered
   * for admins alone. Defaults to hidden until the auth-status probe
   * resolves.
   */
  isAdmin?: boolean;
}

/**
 * These are reached rarely and are about the drive rather than about what
 * is in it, so they are kept out of the purpose list at the top — a row
 * someone presses once a month costs the same glance as one they press
 * every day when the two sit together.
 */
export function SidebarSystemSection({
  driveBase,
  linkClass,
  close,
  driveSummary,
  isAdmin,
}: SidebarSystemSectionProps) {
  const t = useTranslations("sidebar");
  const tMissing = useTranslations("missing");
  const tAdmin = useTranslations("admin");

  return (
    <>
      {driveBase && (
        <>
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
      {isAdmin && (
        <>
          <SidebarSectionHeading label={t("administration")} />
          <Link href="/admin" onClick={close} className={linkClass("/admin")}>
            <Gauge size={16} />
            {tAdmin("title")}
          </Link>
        </>
      )}
    </>
  );
}
