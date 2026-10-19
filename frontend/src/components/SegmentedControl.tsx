"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  style?: CSSProperties;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  iconOnly?: boolean;
  testIdPrefix?: string;
}

const GROUP_CLASS = "gap-0.5 rounded-2xl border border-bg-border p-0.5";

const SEGMENT_CLASS =
  "flex items-center justify-center rounded-xl border transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

/** The border is always there, only its colour changes, so selecting moves nothing. */
const SELECTED_CLASS = "border-accent font-medium text-text-primary";
const UNSELECTED_CLASS = "border-transparent text-text-muted hover:text-text-primary";

const TEXT_SEGMENT_CLASS = "h-8 min-w-0 flex-1 px-1 text-xs pointer-coarse:h-11";

/**
 * On a coarse pointer the width grows and the height does not: a taller box
 * would grow the header row the Markdown toggle sits in. The overhang makes up
 * the height.
 */
const ICON_SEGMENT_CLASS =
  "relative h-8 w-8 pointer-coarse:w-11 " +
  "pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1.5 pointer-coarse:before:content-['']";

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  iconOnly = false,
  testIdPrefix,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`${iconOnly ? "inline-flex" : "flex w-full"} ${GROUP_CLASS}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            data-testid={testIdPrefix ? `${testIdPrefix}${option.value}` : undefined}
            style={option.style}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            className={[
              SEGMENT_CLASS,
              iconOnly ? ICON_SEGMENT_CLASS : TEXT_SEGMENT_CLASS,
              selected ? SELECTED_CLASS : UNSELECTED_CLASS,
            ].join(" ")}
          >
            {iconOnly && Icon ? <Icon size={14} aria-hidden="true" /> : <span className="truncate">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
