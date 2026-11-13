"use client";

import { ArrowDownUp, LayoutList } from "lucide-react";
import { useTranslations } from "next-intl";

import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";
import { APP_CLASSIFICATIONS, type AppClassification } from "@/lib/appPrefs";
import { SORT_CHOICES } from "./labels";

export function ClassificationMenu({
  value,
  offerWatch,
  onChange,
}: {
  value: AppClassification;
  offerWatch: boolean;
  onChange: (value: AppClassification) => void;
}) {
  const t = useTranslations("videoApp");
  const options = APP_CLASSIFICATIONS.filter((c) => offerWatch || c !== "watch").map((c) => ({
    value: c,
    label: t(`classifications.${c}`),
  }));
  return (
    <ToolbarMenu
      label={t("classification")}
      value={t(`classifications.${value}`)}
      icon={LayoutList}
      showLabel
      className="min-w-0"
      align="start"
    >
      {(close) => (
        <MenuRadioGroup<AppClassification>
          heading={t("classification")}
          options={options}
          isSelected={(c) => c === value}
          onSelect={(c) => {
            onChange(c);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}

export function SortChoiceMenu<Id extends string>({
  choices = SORT_CHOICES,
  value,
  onChange,
  quiet = false,
}: {
  choices?: readonly { id: string; labelKey: string }[];
  value: Id;
  onChange: (value: Id) => void;
  quiet?: boolean;
}) {
  const t = useTranslations("videoApp");
  const options = choices.map((choice) => ({ value: choice.id as Id, label: t(choice.labelKey) }));
  const current = choices.find((choice) => choice.id === value) ?? choices[0];
  return (
    <ToolbarMenu
      label={t("sort.label")}
      value={t(current.labelKey)}
      icon={ArrowDownUp}
      truncateValue
      quiet={quiet}
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
