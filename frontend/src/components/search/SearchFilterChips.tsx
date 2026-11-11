"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { useTranslations } from "next-intl";

import {
  operatorChips,
  removeOperatorChip,
  type OperatorChip,
} from "@/lib/searchQuery";

interface SearchFilterChipsProps {
  query: string;
  onRemove: (next: string, index: number) => void;
  /**
   * Where focus lands after a ✕: the next chip's, else the previous, else
   * `fallbackRef`; or always `fallbackRef` (the modal's input).
   */
  focusAfterRemoval?: "next" | "fallback";
  fallbackRef?: RefObject<HTMLElement | null>;
}

function chipValue(
  chip: OperatorChip,
  kindLabel: (kind: string) => string,
): string | null {
  if (chip.operator === "tag") return chip.tag;
  if (chip.operator === "type") return kindLabel(chip.kind);
  if (chip.operator === "path") return chip.folder;
  if (chip.operator === "collection") return chip.collection;
  if (chip.operator === "size" || chip.operator === "duration") return chip.value;
  return null;
}

export function SearchFilterChips({
  query,
  onRemove,
  focusAfterRemoval = "next",
  fallbackRef,
}: SearchFilterChipsProps) {
  const t = useTranslations("search");
  const tFilter = useTranslations("filter");
  const tSidebar = useTranslations("sidebar");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocus = useRef<number | null>(null);
  const chips = operatorChips(query);

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const index = pendingFocus.current;
    pendingFocus.current = null;
    if (focusAfterRemoval === "fallback") {
      fallbackRef?.current?.focus();
      return;
    }
    const target = buttons.current[index] ?? buttons.current[index - 1];
    (target ?? fallbackRef?.current)?.focus();
  }, [query, focusAfterRemoval, fallbackRef]);

  if (chips.length === 0) return null;

  const labelFor = (chip: OperatorChip): string => {
    if (chip.operator === "tag") return t("filterTag");
    if (chip.operator === "type") return t("filterKind");
    if (chip.operator === "path") return t("filterPath");
    if (chip.operator === "collection") return t("filterCollection");
    if (chip.operator === "size") return t("filterSize");
    if (chip.operator === "duration") return t("filterLength");
    return chip.flag === "favorite" ? tSidebar("favorites") : tSidebar("liked");
  };
  const kindLabel = (kind: string) => tFilter(`type.${kind}`);

  return (
    <div
      role="group"
      aria-label={t("filters")}
      data-role="filter-chips"
      className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
    >
      {chips.map((chip, index) => {
        const label = labelFor(chip);
        const value = chip.operator === "is" ? null : chipValue(chip, kindLabel);
        return (
          <span
            key={`${chip.operator}:${value ?? (chip.operator === "is" ? chip.flag : "")}`}
            title={value ?? undefined}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sand py-0.5 pl-2 pr-1 text-xs text-text-primary"
          >
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              <span className="font-semibold">{label}</span>
              {value && <> {value}</>}
            </span>
            <button
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              aria-label={
                value
                  ? t("removeFilter", { label, value })
                  : t("removeFilterOnly", { label })
              }
              onClick={() => {
                const next = removeOperatorChip(query, chip);
                pendingFocus.current = index;
                onRemove(next, index);
              }}
              className="shrink-0 rounded-full p-0.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}
