"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, HardDrive, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Drive } from "@/types";

interface SidebarDriveSwitcherProps {
  drives: Drive[];
  currentDrive: string | null;
  close: () => void;
}

function driveHref(name: string): string {
  return `/drive/${encodeURIComponent(name)}`;
}

/**
 * Where you are, and the way to somewhere else — one row at the top of
 * the sidebar instead of a list at the bottom.
 *
 * Off a drive (the root picker, `/admin`) there is no "here" to fold
 * into, so the list is shown open: folding it would leave the control
 * with nothing to name and no way in. With nowhere else to go the row
 * is not a button either, for the same reason.
 *
 * `getDrives()` already omits locked protected drives (a drive is a
 * security boundary — `.claude/rules/design-decisions.md`), so this
 * renders whatever it is handed and never filters for access itself.
 */
export function SidebarDriveSwitcher({ drives, currentDrive, close }: SidebarDriveSwitcherProps) {
  const t = useTranslations("sidebar");
  const [open, setOpen] = useState(false);

  // Landing on another drive answers the question the open list was
  // asking, so it closes behind you.
  useEffect(() => {
    setOpen(false);
  }, [currentDrive]);

  if (drives.length === 0) return null;

  const current = currentDrive ? drives.find((d) => d.name === currentDrive) : undefined;
  // The current drive is already named by the row above, so the list is
  // the alternatives — never the same name twice in a row.
  const others = current ? drives.filter((d) => d.name !== current.name) : drives;

  const rowClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-bg-elevated text-text-primary font-medium"
        : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
    }`;

  const currentRow = current && (
    <>
      <HardDrive size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{current.name}</span>
      {current.protected && <Lock size={12} className="shrink-0 opacity-40" />}
    </>
  );

  return (
    <div className="mb-1">
      {current &&
        (others.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t("switchDrive")}
            className={`w-full ${rowClass(true)}`}
          >
            {currentRow}
            {open ? (
              <ChevronDown size={14} className="shrink-0" />
            ) : (
              <ChevronRight size={14} className="shrink-0" />
            )}
          </button>
        ) : (
          <div className={rowClass(true)}>{currentRow}</div>
        ))}
      {(open || !current) &&
        others.map((drive) => {
          const href = driveHref(drive.name);
          return (
            <Link key={drive.name} href={href} onClick={close} className={rowClass(false)}>
              <HardDrive size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{drive.name}</span>
              {drive.protected && <Lock size={12} className="shrink-0 opacity-40" />}
            </Link>
          );
        })}
    </div>
  );
}
