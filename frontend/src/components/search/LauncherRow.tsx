"use client";

import type { ReactElement, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface LauncherRowProps {
  index: number;
  selected: boolean;
  mobile: boolean;
  icon: ReactNode;
  label: string;
  detail?: string;
  onOpen: () => void;
  /** Present for a folder that can be browsed into. */
  onEnter?: () => void;
}

export function LauncherRow({
  index,
  selected,
  mobile,
  icon,
  label,
  detail,
  onOpen,
  onEnter,
}: LauncherRowProps): ReactElement {
  const t = useTranslations("pageJump");
  const state = selected ? "bg-bg-elevated" : mobile ? "active:bg-bg-elevated" : "hover:bg-bg-elevated";

  return (
    <div data-search-item={index} className={`flex items-center transition-colors ${state}`}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex min-w-0 flex-1 items-center gap-3 px-4 text-left ${mobile ? "py-3" : "py-2.5"}`}
      >
        {icon}
        <span
          className={`truncate text-sm text-text-primary ${
            detail === undefined ? "min-w-0 flex-1" : "max-w-full shrink-0"
          }`}
        >
          {label}
        </span>
        {detail !== undefined && (
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{detail}</span>
        )}
      </button>
      {onEnter && (
        <button
          type="button"
          onClick={onEnter}
          aria-label={t("browseInto", { name: label })}
          className="hidden h-11 w-11 flex-shrink-0 items-center justify-center text-text-muted pointer-coarse:flex"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
