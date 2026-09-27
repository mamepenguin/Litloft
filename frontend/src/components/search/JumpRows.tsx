"use client";

import type { ReactElement } from "react";

import type { JumpDestination } from "./useJumpDestinations";

interface JumpRowsProps {
  heading: string;
  jumps: readonly JumpDestination[];
  /** Index of the first row in the modal's keyboard order. */
  offset: number;
  selectedIndex: number;
  mobile: boolean;
  onOpen: (jump: JumpDestination) => void;
}

export function JumpRows({
  heading,
  jumps,
  offset,
  selectedIndex,
  mobile,
  onOpen,
}: JumpRowsProps): ReactElement {
  return (
    <div className="pb-1.5">
      <div className="px-4 pt-3 pb-1 text-xs font-medium text-text-muted">
        {heading}
      </div>
      {jumps.map((jump, row) => {
        const idx = offset + row;
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
            <span
              className={`truncate text-sm text-text-primary ${
                jump.detail === undefined ? "min-w-0 flex-1" : "max-w-full shrink-0"
              }`}
            >
              {jump.label}
            </span>
            {jump.detail !== undefined && (
              <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{jump.detail}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
