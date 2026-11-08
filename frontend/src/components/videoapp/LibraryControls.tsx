"use client";

import { ArrowDownUp, LayoutList } from "lucide-react";
import { useTranslations } from "next-intl";

import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";
import { APP_CLASSIFICATIONS, type AppClassification } from "@/lib/appPrefs";
import { SORT_CHOICES, type SortChoice } from "./labels";

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

export function SortChoiceMenu({
  value,
  onChange,
}: {
  value: SortChoice["id"];
  onChange: (value: SortChoice["id"]) => void;
}) {
  const t = useTranslations("videoApp");
  const options = SORT_CHOICES.map((choice) => ({ value: choice.id, label: t(choice.labelKey) }));
  const current = SORT_CHOICES.find((choice) => choice.id === value) ?? SORT_CHOICES[0];
  return (
    <ToolbarMenu
      label={t("sort.label")}
      value={t(current.labelKey)}
      icon={ArrowDownUp}
      truncateValue
      className="min-w-0"
      align="end"
    >
      {(close) => (
        <MenuRadioGroup<SortChoice["id"]>
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
