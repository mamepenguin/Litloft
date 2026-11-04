"use client";

import { useLocale, useTranslations } from "next-intl";
import type { RefObject } from "react";

import { EmptyState } from "@/components/EmptyState";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { Inbox } from "lucide-react";
import { SelectionBar } from "@/components/SelectionBar";
import type { FileProcessing, InboxItem } from "@/lib/api";
import {
  groupInboxItems,
  inboxFolderLabel,
  inboxTimeLabel,
  type InboxGroupKey,
} from "@/lib/inboxGrouping";
import { resolveInboxStage } from "@/lib/inboxStage";
import { InboxRow } from "./InboxRow";

export interface InboxPresenterProps {
  driveName: string;
  items: InboxItem[];
  openCount: number;
  loading: boolean;
  stages: Record<string, FileProcessing | null | undefined>;
  selectedIds: ReadonlySet<string>;
  selectionMode: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  onToggle: (id: string) => void;
  onDone: (id: string) => void;
  onLongPress: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, item: InboxItem) => void;
  onMarkAllDone: () => void;
  onSelectionDone: (ids: string[]) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onReload: () => void;
}

const GROUP_LABEL: Record<InboxGroupKey, string> = {
  today: "today",
  yesterday: "yesterday",
  earlier: "earlier",
};

export function InboxPresenter({
  driveName,
  items,
  openCount,
  loading,
  stages,
  selectedIds,
  selectionMode,
  sentinelRef,
  onToggle,
  onDone,
  onLongPress,
  onContextMenu,
  onMarkAllDone,
  onSelectionDone,
  onClearSelection,
  onSelectAll,
  onReload,
}: InboxPresenterProps) {
  const t = useTranslations("inbox");
  const tRoot = useTranslations();
  const locale = useLocale();
  const now = new Date();
  const groups = groupInboxItems(items, now);

  const sourceLabel = (item: InboxItem) => {
    const translated = tRoot(item.source_i18n_key);
    return translated === item.source_i18n_key ? item.source : translated;
  };

  const scope =
    openCount === 1
      ? t("scopeOne", { drive: driveName })
      : t("scope", { drive: driveName, count: openCount });

  return (
    <PageFrame
      width="full"
      header={
        <PageHeader
          titleIcon={Inbox}
          title={t("title")}
          scope={scope}
          actions={
            items.length > 0 ? (
              <Button variant="secondary" onClick={onMarkAllDone}>
                {t("markAllDone")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="px-4 pb-6 pt-2">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="mb-2 px-3 text-xs font-medium text-text-muted">
                  {t(GROUP_LABEL[group.key])}
                </h2>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const answer = stages[item.file.id];
                    return (
                      <InboxRow
                        key={item.file.id}
                        item={item}
                        sourceLabel={sourceLabel(item)}
                        timeLabel={inboxTimeLabel(
                          item.arrived_at,
                          now,
                          locale,
                          t,
                        )}
                        folderLabel={inboxFolderLabel(
                          item.file.folder_path,
                          t("root"),
                        )}
                        stage={
                          answer
                            ? resolveInboxStage(answer.stages, answer.ready)
                            : { kind: "none" }
                        }
                        selected={selectedIds.has(item.file.id)}
                        selectionMode={selectionMode}
                        onToggle={onToggle}
                        onDone={onDone}
                        onLongPress={onLongPress}
                        onContextMenu={onContextMenu}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="flex items-center justify-center py-4" />
      </div>

      {selectedIds.size > 0 && (
        <SelectionBar
          count={selectedIds.size}
          selectedIds={new Set(selectedIds)}
          totalCount={items.length}
          drive={driveName}
          currentPath=""
          isInboxView
          onInboxDone={onSelectionDone}
          onSelectAll={onSelectAll}
          onClear={onClearSelection}
          onComplete={onReload}
        />
      )}
    </PageFrame>
  );
}
