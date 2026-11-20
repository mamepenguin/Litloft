"use client";

import { ArrowDownUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";
import { SORT_CHOICES } from "./labels";

export function ReadingSortMenu<Id extends string>({
  choices = SORT_CHOICES,
  value,
  onChange,
  filled = false,
  quiet = false,
}: {
  choices?: readonly { id: string; labelKey: string }[];
  value: Id;
  onChange: (value: Id) => void;
  filled?: boolean;
  quiet?: boolean;
}) {
  const t = useTranslations("readingApp");
  const options = choices.map((choice) => ({ value: choice.id as Id, label: t(choice.labelKey) }));
  const current = choices.find((choice) => choice.id === value) ?? choices[0];
  return (
    <ToolbarMenu
      label={t("sort.label")}
      value={t(current.labelKey)}
      icon={ArrowDownUp}
      truncateValue
      filled={filled}
      quiet={quiet}
      fullValue={quiet}
      className="min-w-0"
      align="end"
    >
      {(close) => (
        <MenuRadioGroup<Id>
          heading={t("sort.label")}
          options={options}
          isSelected={(id) => id === value}
          onSelect={(id) => {
            onChange(id);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}
