"use client";

import { ArrowDownUp, BookMarked, Check, Layers, Tag } from "lucide-react";
import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { RetryButton } from "@/components/appshell/RetryButton";
import { useLoad } from "@/components/appshell/useLoad";
import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";
import { getDriveTags, type ShelfWatchState } from "@/lib/api";
import type { ReadingGroup } from "@/lib/appPrefs";
import { SORT_CHOICES } from "./labels";

export type ReadingState = "all" | ShelfWatchState;

function TagRows({
  drive,
  selected,
  onToggle,
}: {
  drive: string;
  selected: readonly string[];
  onToggle: (tag: string) => void;
}) {
  const t = useTranslations("readingApp");
  const load = useCallback(() => getDriveTags(drive), [drive]);
  const { state, retry } = useLoad(load);

  if (state.status === "failed") return <RetryButton onRetry={retry} />;

  return (
    <>
      <p className="px-3 py-1.5 text-xs font-semibold text-text-muted" aria-hidden="true">
        {t("tag")}
      </p>
      {state.status === "loaded" && state.data.length === 0 && (
        <p className="px-3 py-2 text-sm text-text-muted">{t("noTags")}</p>
      )}
      {state.status === "loaded" &&
        state.data.map((tag) => {
          const checked = selected.includes(tag.name);
          return (
            <button
              key={tag.name}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              onClick={() => onToggle(tag.name)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:-outline-offset-2 ${
                checked
                  ? "bg-bg-elevated font-medium text-text-primary"
                  : "text-text-primary hover:bg-bg-elevated"
              }`}
            >
              <span className="w-4 flex-shrink-0">{checked && <Check size={14} />}</span>
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              <span className="flex-shrink-0 text-xs tabular-nums text-text-muted">
                {tag.count}
              </span>
            </button>
          );
        })}
    </>
  );
}

export function TagMenu({
  drive,
  selected,
  onToggle,
}: {
  drive: string;
  selected: readonly string[];
  onToggle: (tag: string) => void;
}) {
  const t = useTranslations("readingApp");
  const value = selected.length === 0 ? t("tagNone") : selected.join(", ");
  return (
    <ToolbarMenu
      label={t("tag")}
      value={value}
      icon={Tag}
      truncateValue
      filled
      className="min-w-0"
      align="start"
    >
      {() => <TagRows drive={drive} selected={selected} onToggle={onToggle} />}
    </ToolbarMenu>
  );
}

const STATE_OPTIONS: readonly ReadingState[] = ["all", "unwatched", "in_progress", "finished"];

export function StateMenu({
  value,
  onChange,
}: {
  value: ReadingState;
  onChange: (value: ReadingState) => void;
}) {
  const t = useTranslations("readingApp");
  const options = STATE_OPTIONS.map((state) => ({
    value: state,
    label: t(`state.${state}`),
  }));
  return (
    <ToolbarMenu
      label={t("state.label")}
      value={t(`state.${value}`)}
      icon={BookMarked}
      showLabel
      filled
      className="min-w-0"
      align="start"
    >
      {(close) => (
        <MenuRadioGroup<ReadingState>
          heading={t("state.label")}
          options={options}
          isSelected={(state) => state === value}
          onSelect={(state) => {
            onChange(state);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}

export function GroupMenu({
  value,
  onChange,
}: {
  value: ReadingGroup;
  onChange: (value: ReadingGroup) => void;
}) {
  const t = useTranslations("readingApp");
  const options = [
    { value: "none" as const, label: t("group.none") },
    { value: "tag" as const, label: t("group.byTag") },
  ];
  return (
    <ToolbarMenu
      label={t("group.label")}
      value={t(`group.${value === "none" ? "none" : "byTag"}`)}
      icon={Layers}
      showLabel
      filled
      className="min-w-0 ml-auto"
      align="start"
    >
      {(close) => (
        <MenuRadioGroup<ReadingGroup>
          heading={t("group.label")}
          options={options}
          isSelected={(group) => group === value}
          onSelect={(group) => {
            onChange(group);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}

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
