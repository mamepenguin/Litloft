"use client";

import type { ComponentType } from "react";

export interface ActionMenuItemProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}

export function ActionMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
  active,
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
      aria-pressed={active}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:hover:bg-transparent ${
        danger
          ? "text-danger hover:bg-accent/10"
          : active
            ? "bg-bg-elevated font-medium text-text-primary"
            : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
