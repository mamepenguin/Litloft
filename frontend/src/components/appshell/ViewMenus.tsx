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
 * The row a Library's view menus sit in. Below `sm` the children share two
 * equal columns, so the view menus stay on one row; from `sm` they follow one
 * another in a line.
 */
export function LibraryControlRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "grid grid-cols-2 items-center gap-2",
        "sm:flex sm:flex-wrap",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
