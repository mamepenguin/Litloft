"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";

import type { JumpDestination } from "./useJumpDestinations";

interface JumpRowsProps {
  jumps: readonly JumpDestination[];
  selectedIndex: number;
  mobile: boolean;
  onOpen: (jump: JumpDestination) => void;
}

export function JumpRows({ jumps, selectedIndex, mobile, onOpen }: JumpRowsProps): ReactElement {
  const t = useTranslations("pageJump");

  return (
    <div className="pb-1.5">
      <div className="px-4 pt-3 pb-1 text-xs font-medium text-text-muted">
        {t("section")}
      </div>
      {jumps.map((jump, idx) => {
        const Icon = jump.icon;
        return (
          <button
            key={jump.key}
            type="button"
            data-search-item={idx}
            onClick={() => onOpen(jump)}
            className={`flex w-full items-center gap-3 px-4 text-left transition-colors ${
              mobile
                ? `py-3 ${selectedIndex === idx ? "bg-bg-elevated" : "active:bg-bg-elevated"}`
                : `py-2.5 ${selectedIndex === idx ? "bg-bg-elevated" : "hover:bg-bg-elevated"}`
            }`}
          >
            <Icon size={mobile ? 18 : 16} className="flex-shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{jump.label}</span>
          </button>
        );
      })}
    </div>
  );
}
