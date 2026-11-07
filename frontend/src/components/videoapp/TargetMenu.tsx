"use client";

import { useMemo } from "react";
import { Target } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { MenuRadioGroup, ToolbarMenu } from "@/components/ToolbarMenu";
import { getDriveFiles } from "@/lib/api";
import { resolveVideoTarget } from "@/lib/videoAppTarget";
import type { SmartFolder } from "@/types/smartFolder";
import { useLoad } from "./useLoad";

/** Mounted only while the menu is open, so the default target's count is asked for then. */
function Rows({
  drive,
  folders,
  selectedId,
  currentCount,
  onChoose,
}: {
  drive: string;
  folders: readonly SmartFolder[];
  selectedId: string;
  /** The count under the target in force, which is the default's when that is selected. */
  currentCount: number | null;
  onChoose: (id: string) => void;
}) {
  const t = useTranslations("videoApp");
  const locale = useLocale();
  const onDefault = selectedId === "default";
  const loadDefaultCount = useMemo(
    () =>
      onDefault
        ? null
        : () => getDriveFiles(drive, { type: ["video"], limit: 1 }).then((page) => page.meta.total),
    [drive, onDefault],
  );
  const { state } = useLoad(loadDefaultCount);
  const defaultCount = onDefault ? currentCount : state.status === "loaded" ? state.data : null;

  const options = [
    {
      value: "default",
      label: t("allVideos"),
      detail: defaultCount === null ? undefined : new Intl.NumberFormat(locale).format(defaultCount),
    },
    ...folders.map((folder) => {
      const usable = resolveVideoTarget(folder).usable;
      return {
        value: folder.id,
        label: folder.name,
        disabled: !usable,
        title: usable ? undefined : t("targetUnavailable"),
      };
    }),
  ];

  return (
    <MenuRadioGroup<string>
      heading={t("target")}
      options={options}
      isSelected={(id) => id === selectedId}
      onSelect={onChoose}
    />
  );
}

export function TargetMenu({
  drive,
  name,
  folders,
  selectedId,
  currentCount,
  onChoose,
}: {
  drive: string;
  /** What the button reads; `null` while the saved folder is looked up. */
  name: string | null;
  folders: readonly SmartFolder[];
  selectedId: string;
  currentCount: number | null;
  onChoose: (id: string) => void;
}) {
  const t = useTranslations("videoApp");
  return (
    <ToolbarMenu label={t("target")} value={name ?? "…"} icon={Target} showLabel align="end">
      {(close) => (
        <Rows
          drive={drive}
          folders={folders}
          selectedId={selectedId}
          currentCount={currentCount}
          onChoose={(id) => {
            onChoose(id);
            close();
          }}
        />
      )}
    </ToolbarMenu>
  );
}
