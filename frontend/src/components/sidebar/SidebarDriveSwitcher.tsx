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
 * Off a drive (the root picker, `/admin`) there is no "here", so the row
 * that folds the list names the list instead — "Drives (4)". The list
 * then follows `open` wherever you are, and being off a drive stops
 * being a special case: on the root the body already lists every drive
 * as a card, and a sidebar repeating that is the same answer twice.
 *
 * With nowhere else to go the row is not a button, for the same reason
 * as on a drive: a control with one destination is not a choice.
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

  // Off a drive, the fold is named by what it holds. Not a
  // `SidebarSectionHeading`: Phase 1 cut the sidebar to five headings and
  // `sidebar-headings.test.ts` pins that count, and this is not a section
  // label — it is the same fold-here row as the current-drive one, in the
  // place that row would occupy.
  const allDrivesRow = !current && others.length > 1 && (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      // No `aria-label`: the row's content is already "Drives (4)", so its
      // accessible name is the visible text and WCAG 2.5.3 is satisfied by
      // the content. An override identical to it is one more string to
      // keep in step. The current-drive row does carry one, because there
      // the text is just a drive name and the label adds what pressing it
      // does.
      className={`w-full ${rowClass(false)}`}
    >
      <HardDrive size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">
        {t("allDrives", { count: others.length })}
      </span>
      {open ? (
        <ChevronDown size={14} className="shrink-0" />
      ) : (
        <ChevronRight size={14} className="shrink-0" />
      )}
    </button>
  );

  // With one drive there is nothing to fold: the fold row and the list
  // row are one line each, so folding turns one line into two. A choice
  // between one thing is not a choice.
  const listVisible = current || others.length > 1 ? open : true;

  return (
    <div className="mb-1">
      {allDrivesRow}
      {current &&
        (others.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            // The name has to contain the visible label (WCAG 2.5.3):
            // what the row reads is the drive's name, so someone
            // saying "click media" has to reach it. It also has to say
            // what pressing does, since the name is otherwise just a
            // noun. Both, in that order.
            aria-label={t("switchDrive", { drive: current.name })}
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
      {listVisible &&
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
