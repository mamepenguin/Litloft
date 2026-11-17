"use client";

import { useLayoutEffect } from "react";
import { HardDrive } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { focusModeStore } from "@/lib/focusModeStore";

/** A link wearing §Buttons' look: the label sizes it, the floor is only on touch. */
const LINK =
  "flex items-center rounded-2xl px-4 py-2 text-sm transition-colors pointer-coarse:min-h-11";

export interface DriveUnavailableProps {
  drive: string;
  /** Drawn only when the viewer could unlock a protected drive. */
  unlockHref?: string;
}

/**
 * The drive's page in place of every route under it. It never says whether the
 * drive is unknown or locked: the API answers both with the same 404.
 */
export function DriveUnavailable({ drive, unlockHref }: DriveUnavailableProps) {
  const t = useTranslations("driveUnavailable");

  // This screen is not a file page whatever the URL still names, so focus
  // mode ends here rather than over it.
  useLayoutEffect(() => {
    focusModeStore.set(false);
  }, []);

  return (
    <div className="flex h-below-header w-full flex-col items-center justify-center overflow-hidden px-6 pb-[120px]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-elevated">
        <HardDrive size={24} aria-hidden="true" className="text-text-muted" />
      </div>
      <h1 className="mt-4 w-full break-anywhere text-center text-lg font-bold text-text-primary">
        {t("title", { name: drive })}
      </h1>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className={`${LINK} bg-sand text-text-primary hover:bg-sand-hover`}
        >
          {t("allDrives")}
        </Link>
        {unlockHref && (
          <Link
            href={unlockHref}
            className={`${LINK} text-text-muted hover:bg-bg-elevated`}
          >
            {t("unlock")}
          </Link>
        )}
      </div>
    </div>
  );
}
