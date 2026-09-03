"use client";

import { type LucideIcon } from "lucide-react";

export interface ActionMenuItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Destructive actions (delete, purge). Uses the danger token per DESIGN.md §Buttons. */
  danger?: boolean;
}

/**
 * One row of a `[...]` overflow menu.
 *
 * Shared so that an addon rendering into a menu slot (`file-actions-menu`)
 * draws a row indistinguishable from the host's own, instead of restating
 * the classes and drifting from the menu around it.
 */
export function ActionMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: ActionMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      // `:hover` still matches a disabled button, so without the override the
      // danger row tints accent under the pointer while refusing the click.
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:hover:bg-transparent ${
        danger
          ? "text-danger hover:bg-accent/10"
          : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
