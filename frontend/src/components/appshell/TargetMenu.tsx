"use client";

import { useMemo, useState } from "react";
import { Settings2, Target } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { MenuRadioGroup, MenuSeparator, ToolbarMenu } from "@/components/ToolbarMenu";
import { getDriveFiles } from "@/lib/api";
import type { AppKey } from "@/lib/appPrefs";
import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import { ManageTargetsDialog } from "./ManageTargetsDialog";
import { useLoad, type LoadState } from "./useLoad";
import { useShownTargets } from "./useShownTargets";

export interface TargetMenuProps {
  drive: string;
  app: AppKey;
  /** What the button reads; `null` while the saved folder is looked up. */
  name: string | null;
  folders: LoadState<SmartFolder[]>;
  selectedId: string;
  currentCount: number | null;
  /** The control's name, "Target". */
  label: string;
  defaultLabel: string;
  unavailableLabel: string;
  /** The kinds the app's default target counts. */
  defaultTargetTypes: readonly FileKind[];
  isUsable: (folder: SmartFolder) => boolean;
  onChoose: (id: string) => void;
  onRetryFolders: () => void;
}

/** Mounted only while the menu is open, so the default target's count is asked for then. */
function Rows({
  drive,
  folders,
  selectedId,
  currentCount,
  label,
  defaultLabel,
  unavailableLabel,
  defaultTargetTypes,
  isUsable,
  onChoose,
  onManage,
}: {
  drive: string;
  folders: readonly SmartFolder[];
  selectedId: string;
  currentCount: number | null;
  label: string;
  defaultLabel: string;
  unavailableLabel: string;
  defaultTargetTypes: readonly FileKind[];
  isUsable: (folder: SmartFolder) => boolean;
  onChoose: (id: string) => void;
  onManage: () => void;
}) {
  const t = useTranslations("appShell");
  const locale = useLocale();
  const onDefault = selectedId === "default";
  // Compared by value: an inline array would otherwise re-request the count on
  // every render of the open menu.
  const typesKey = JSON.stringify(defaultTargetTypes);
  const types = useMemo<FileKind[]>(() => JSON.parse(typesKey), [typesKey]);
  const loadDefaultCount = useMemo(
    () =>
      onDefault
        ? null
        : () =>
            getDriveFiles(drive, { type: types, limit: 1 }).then(
              (page) => page.meta.total,
            ),
    [drive, onDefault, types],
  );
  const { state } = useLoad(loadDefaultCount);
  const defaultCount = onDefault ? currentCount : state.status === "loaded" ? state.data : null;

  const options = [
    {
      value: "default",
      label: defaultLabel,
      detail: defaultCount === null ? undefined : new Intl.NumberFormat(locale).format(defaultCount),
    },
    ...folders.map((folder) => {
      const usable = isUsable(folder);
      return {
        value: folder.id,
        label: folder.name,
        disabled: !usable,
        title: usable ? undefined : unavailableLabel,
      };
    }),
  ];

  return (
    <>
      <MenuRadioGroup<string>
        heading={label}
        options={options}
        isSelected={(id) => id === selectedId}
        onSelect={onChoose}
      />
      <MenuSeparator />
      <button
        type="button"
        role="menuitem"
        onClick={onManage}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated focus-visible:-outline-offset-2"
      >
        <span className="w-4 flex-shrink-0">
          <Settings2 size={14} />
        </span>
        {t("manage")}
      </button>
    </>
  );
}

export function TargetMenu({
  drive,
  app,
  name,
  folders,
  selectedId,
  currentCount,
  label,
  defaultLabel,
  unavailableLabel,
  defaultTargetTypes,
  isUsable,
  onChoose,
  onRetryFolders,
}: TargetMenuProps) {
  const { saved, setShown } = useShownTargets(app, drive);
  const [manageOpen, setManageOpen] = useState(false);

  const all = folders.status === "loaded" ? folders.data : [];
  const usable = useMemo(() => all.filter(isUsable), [all, isUsable]);
  const shownIds = useMemo(() => {
    if (saved === null) return new Set(usable.map((folder) => folder.id));
    const known = new Set(all.map((folder) => folder.id));
    return new Set(saved.filter((id) => known.has(id)));
  }, [saved, all, usable]);
  const listed = useMemo(() => {
    const members = saved === null ? all : all.filter((folder) => shownIds.has(folder.id));
    const current = all.find((folder) => folder.id === selectedId);
    if (current && isUsable(current) && !members.some((folder) => folder.id === current.id)) {
      return [...members, current];
    }
    return members;
  }, [saved, all, shownIds, selectedId, isUsable]);

  return (
    <>
      <ToolbarMenu label={label} value={name ?? "…"} icon={Target} showLabel filled align="end">
        {(close) => (
          <Rows
            drive={drive}
            folders={listed}
            selectedId={selectedId}
            currentCount={currentCount}
            label={label}
            defaultLabel={defaultLabel}
            unavailableLabel={unavailableLabel}
            defaultTargetTypes={defaultTargetTypes}
            isUsable={isUsable}
            onChoose={(id) => {
              onChoose(id);
              close();
            }}
            onManage={() => {
              close();
              setManageOpen(true);
            }}
          />
        )}
      </ToolbarMenu>
      <ManageTargetsDialog
        open={manageOpen}
        folders={folders}
        saved={saved}
        isUsable={isUsable}
        onShownChange={setShown}
        onRetryFolders={onRetryFolders}
        onClose={() => setManageOpen(false)}
      />
    </>
  );
}
