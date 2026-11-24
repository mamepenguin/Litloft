"use client";

import type { ReactNode } from "react";
import { ArrowDownUp, LayoutList } from "lucide-react";
import { useTranslations } from "next-intl";

import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";

/** One choice of a view menu; the app owns the values and their labels. */
export interface ViewMenuOption<Value extends string> {
  value: Value;
  label: string;
}

export function GroupMenu<Value extends string>({
  value,
  options,
  onChange,
}: {
  value: Value;
  options: ReadonlyArray<ViewMenuOption<Value>>;
  onChange: (value: Value) => void;
}) {
  const t = useTranslations("appView");
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <ToolbarMenu
      label={t("groupBy")}
      value={current?.label ?? ""}
      icon={LayoutList}
      showLabel
      fullWidth
      className="min-w-0"
      align="start"
    >
      {(close) => (
        <MenuRadioGroup<Value>
          heading={t("groupBy")}
          options={options}
          isSelected={(candidate) => candidate === value}
          onSelect={(candidate) => {
            onChange(candidate);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}

export function SortMenu<Value extends string>({
  value,
  options,
  onChange,
  showLabel = true,
}: {
  value: Value;
  options: ReadonlyArray<ViewMenuOption<Value>>;
  onChange: (value: Value) => void;
  showLabel?: boolean;
}) {
  const t = useTranslations("appView");
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <ToolbarMenu
      label={t("sortBy")}
      value={current?.label ?? ""}
      icon={ArrowDownUp}
      showLabel={showLabel}
      truncateValue
      fullWidth
      className="min-w-0"
      align="end"
    >
      {(close) => (
        <MenuRadioGroup<Value>
          heading={t("sortBy")}
          options={options}
          isSelected={(candidate) => candidate === value}
          onSelect={(candidate) => {
            onChange(candidate);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}

/**
 * The row a Library's filter and view menus sit in. Below `sm` the two groups
 * stack, each a two-column grid, so a lone filter keeps the left half and the
 * view menus share a row; from `sm` the groups follow one another, 20px apart,
 * and the view group wraps as a unit when the line is too narrow.
 */
export function LibraryControlRow({
  filters,
  children,
  className = "",
}: {
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["flex flex-col gap-2", "sm:flex-row sm:flex-wrap sm:items-center sm:gap-5", className]
        .filter(Boolean)
        .join(" ")}
    >
      {filters !== undefined && (
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:shrink-0 sm:flex-nowrap">
          {filters}
        </div>
      )}
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:shrink-0 sm:flex-nowrap">
        {children}
      </div>
    </div>
  );
}
