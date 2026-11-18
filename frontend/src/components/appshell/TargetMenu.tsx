"use client";

import { useMemo, useState } from "react";
import { Library, ListFilter, Settings2, Target } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { MenuRadioGroup, MenuSeparator, ToolbarMenu } from "@/components/ToolbarMenu";
import { getDriveFiles } from "@/lib/api";
import { collectionTargetId } from "@/lib/appTarget";
import type { AppKey } from "@/lib/appPrefs";
import type { CollectionSummary, FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import { ManageTargetsDialog } from "./ManageTargetsDialog";
import { useLoad, type LoadState } from "./useLoad";
import { useShownTargets } from "./useShownTargets";

export interface TargetRow {
  /** What choosing the row saves: `collection:<id>` or a Smart Collection id. */
  targetId: string;
  name: string;
  kind: "collection" | "smart";
  /** A collection is always usable; a Smart Collection's query may not be. */
  usable: boolean;
}

export interface TargetMenuProps {
  drive: string;
  app: AppKey;
  /** What the button reads; `null` while the saved target is looked up. */
  name: string | null;
  folders: LoadState<SmartFolder[]>;
  /** Without it the menu lists no collection. */
  collections?: { list: LoadState<CollectionSummary[]>; retry: () => void };
  selectedId: string;
  currentCount: number | null;
  /** The control's name, "Target". */
  label: string;
  defaultLabel: string;
  unavailableLabel: string;
  /** The kinds the app's default target counts. */
  defaultTargetTypes: readonly FileKind[];
  /** An origin the default target's count leaves out; absent counts every origin. */
  defaultTargetExcludeOrigin?: string;
  /** An origin the default target's count is limited to; absent counts every origin. */
  defaultTargetOrigin?: string;
  isUsable: (folder: SmartFolder) => boolean;
  onChoose: (id: string) => void;
  onRetryFolders: () => void;
}

const NO_FOLDERS: readonly SmartFolder[] = [];
const NO_COLLECTIONS: readonly CollectionSummary[] = [];

function targetRows(
  folders: readonly SmartFolder[],
  collections: readonly CollectionSummary[],
  isUsable: (folder: SmartFolder) => boolean,
  locale: string,
): TargetRow[] {
  const collator = new Intl.Collator(locale, { numeric: true });
  return [
    ...collections.map((collection) => ({
      targetId: collectionTargetId(collection.id),
      name: collection.name,
      kind: "collection" as const,
      usable: true,
    })),
    ...folders.map((folder) => ({
      targetId: folder.id,
      name: folder.name,
      kind: "smart" as const,
      usable: isUsable(folder),
    })),
  ].sort((a, b) => {
    const byName = collator.compare(a.name, b.name);
    if (byName !== 0) return byName;
    if (a.kind !== b.kind) return a.kind === "collection" ? -1 : 1;
    return a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0;
  });
}

function isPending(state: LoadState<unknown>): boolean {
  return state.status === "idle" || state.status === "loading";
}

/** Mounted only while the menu is open, so the default target's count is asked for then. */
function Rows({
  drive,
  rows,
  selectedId,
  currentCount,
  label,
  defaultLabel,
  unavailableLabel,
  defaultTargetTypes,
  defaultTargetExcludeOrigin,
  defaultTargetOrigin,
  onChoose,
  onManage,
}: {
  drive: string;
  rows: readonly TargetRow[];
  selectedId: string;
  currentCount: number | null;
  label: string;
  defaultLabel: string;
  unavailableLabel: string;
  defaultTargetTypes: readonly FileKind[];
  defaultTargetExcludeOrigin?: string;
  defaultTargetOrigin?: string;
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
            getDriveFiles(drive, {
              type: types,
              limit: 1,
              ...(defaultTargetOrigin ? { origin: defaultTargetOrigin } : {}),
              ...(defaultTargetExcludeOrigin ? { exclude_origin: defaultTargetExcludeOrigin } : {}),
            }).then((page) => page.meta.total),
    [drive, onDefault, types, defaultTargetExcludeOrigin, defaultTargetOrigin],
  );
  const { state } = useLoad(loadDefaultCount);
  const defaultCount = onDefault ? currentCount : state.status === "loaded" ? state.data : null;

  const options = [
    {
      value: "default",
      label: defaultLabel,
      detail: defaultCount === null ? undefined : new Intl.NumberFormat(locale).format(defaultCount),
    },
    ...rows.map((row) => ({
      value: row.targetId,
      label: row.name,
      icon: row.kind === "collection" ? Library : ListFilter,
      ...(row.usable ? {} : { disabled: true, title: unavailableLabel }),
    })),
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
  collections,
  selectedId,
  currentCount,
  label,
  defaultLabel,
  unavailableLabel,
  defaultTargetTypes,
  defaultTargetExcludeOrigin,
  defaultTargetOrigin,
  isUsable,
  onChoose,
  onRetryFolders,
}: TargetMenuProps) {
  const { saved, setShown } = useShownTargets(app, drive);
  const [manageOpen, setManageOpen] = useState(false);
  const locale = useLocale();

  const folderData = folders.status === "loaded" ? folders.data : NO_FOLDERS;
  const collectionData =
    collections?.list.status === "loaded" ? collections.list.data : NO_COLLECTIONS;
  const all = useMemo(
    () => targetRows(folderData, collectionData, isUsable, locale),
    [folderData, collectionData, isUsable, locale],
  );
  // A saved set lists exactly its members, plus the current target so the
  // checked row is always visible.
  const listed = useMemo(
    () =>
      saved === null
        ? all
        : all.filter(
            (row) => saved.includes(row.targetId) || (row.targetId === selectedId && row.usable),
          ),
    [all, saved, selectedId],
  );
  const pending = isPending(folders) || (collections !== undefined && isPending(collections.list));
  const collectionsFailed = collections?.list.status === "failed";
  const failed = folders.status === "failed" || collectionsFailed;

  return (
    <>
      <ToolbarMenu label={label} value={name ?? "…"} icon={Target} quiet align="end">
        {(close) => (
          <Rows
            drive={drive}
            rows={listed}
            selectedId={selectedId}
            currentCount={currentCount}
            label={label}
            defaultLabel={defaultLabel}
            unavailableLabel={unavailableLabel}
            defaultTargetTypes={defaultTargetTypes}
            defaultTargetExcludeOrigin={defaultTargetExcludeOrigin}
            defaultTargetOrigin={defaultTargetOrigin}
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
        rows={all}
        saved={saved}
        pending={pending}
        failed={failed}
        onShownChange={setShown}
        onRetry={() => {
          if (folders.status === "failed") onRetryFolders();
          if (collectionsFailed) collections?.retry();
        }}
        onClose={() => setManageOpen(false)}
      />
    </>
  );
}
