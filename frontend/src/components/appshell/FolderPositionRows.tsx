"use client";

import { Fragment, type MouseEvent } from "react";
import { ChevronRight, Home } from "lucide-react";
import { useTranslations } from "next-intl";

import { RetryButton } from "./RetryButton";
import { folderCrumbs } from "./folderPosition";
import type { FolderChip } from "./folders";

const CRUMB = "inline-flex flex-shrink-0 items-center rounded-lg px-1 py-0.5 pointer-coarse:min-h-11";
const CRUMB_LINK = `${CRUMB} transition-colors hover:text-text-primary`;
const CRUMB_PLAIN = "inline-flex flex-shrink-0 items-center px-1 py-0.5 pointer-coarse:min-h-11";
const CRUMB_CURRENT = `${CRUMB_PLAIN} font-medium text-text-primary`;

export interface FolderPositionRowsProps {
  /** The folder the Library is looking at; `null` at the top of the target. */
  position: string | null;
  /** The target's own folders, for deciding which crumbs change the view. */
  targetFolders: readonly string[];
  /** The chips answer's `base`: the deepest folder every matching file lies under. */
  base: string;
  chips: readonly FolderChip[];
  chipsStatus: "idle" | "loading" | "ready" | "failed";
  chipsError: boolean;
  onRetry: () => void;
  /** A Library URL carrying `folder`; `null` is the Library itself. */
  href: (folder: string | null) => string;
  /** Choose a chip or a link crumb. */
  onChoose: (folder: string | null) => void;
}

export function FolderPositionRows({
  position,
  targetFolders,
  base,
  chips,
  chipsStatus,
  chipsError,
  onRetry,
  href,
  onChoose,
}: FolderPositionRowsProps) {
  const t = useTranslations("common");
  const crumbs = folderCrumbs(position, targetFolders, base);
  const showChips = chips.length > 0 || chipsStatus === "failed" || chipsError;

  const choose = (event: MouseEvent<HTMLAnchorElement>, folder: string | null) => {
    event.preventDefault();
    onChoose(folder);
  };

  return (
    <>
      {crumbs.length > 0 && (
        <nav
          data-crumbs=""
          aria-label={t("folderPosition")}
          className="flex flex-wrap items-center gap-1 whitespace-nowrap text-sm text-text-muted pointer-coarse:flex-nowrap pointer-coarse:overflow-x-auto"
        >
          {position === null ? (
            <span data-crumb="" aria-label={t("folderTop")} className={CRUMB_PLAIN}>
              <Home size={16} aria-hidden="true" />
            </span>
          ) : (
            <a
              data-crumb=""
              href={href(null)}
              aria-label={t("folderTop")}
              onClick={(event) => choose(event, null)}
              className={CRUMB_LINK}
            >
              <Home size={16} aria-hidden="true" />
            </a>
          )}
          {crumbs.map((crumb) => (
            <Fragment key={crumb.folder}>
              <ChevronRight size={14} aria-hidden="true" className="flex-shrink-0" />
              {crumb.link ? (
                <a
                  data-crumb=""
                  href={href(crumb.folder)}
                  onClick={(event) => choose(event, crumb.folder)}
                  className={CRUMB_LINK}
                >
                  {crumb.name}
                </a>
              ) : (
                <span
                  data-crumb=""
                  aria-current={crumb.current ? "page" : undefined}
                  className={crumb.current ? CRUMB_CURRENT : CRUMB_PLAIN}
                >
                  {crumb.name}
                </span>
              )}
            </Fragment>
          ))}
        </nav>
      )}

      {showChips && (
        <div
          data-chips=""
          data-testid="folder-chips"
          className="flex flex-wrap gap-2 pb-1 max-h-[8rem] overflow-y-auto pointer-coarse:max-h-none pointer-coarse:flex-nowrap pointer-coarse:overflow-x-auto"
        >
          {chips.map((chip) => (
            <a
              key={chip.key}
              data-chip=""
              href={href(chip.key)}
              onClick={(event) => choose(event, chip.key)}
              className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-bg-elevated px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-sand pointer-coarse:min-h-11"
            >
              {chip.label || chip.key.split("/").at(-1)}
              <span className="text-text-muted">{chip.count}</span>
            </a>
          ))}
          {(chipsStatus === "failed" || chipsError) && (
            <div className="flex flex-shrink-0 items-center">
              <RetryButton onRetry={onRetry} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
