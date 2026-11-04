"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { FileContextMenu } from "@/components/FileContextMenu";
import { UploadZone } from "@/components/UploadZone";
import { useToast } from "@/components/ToastProvider";
import { usePointerMode } from "@/components/player/hooks/usePointerMode";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSelection } from "@/hooks/useSelection";
import {
  markInboxDone,
  undoInboxDone,
  type InboxItem,
} from "@/lib/api";
import type { FileItem } from "@/types";
import { InboxPresenter } from "./InboxPresenter";
import { useInboxData } from "./useInboxData";
import { useInboxStages } from "./useInboxStages";

const DONE_BATCH_SIZE = 1000;

function batchesOf<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

export function InboxView({ driveName }: { driveName: string }) {
  const t = useTranslations("inbox");
  const tErrors = useTranslations("errors");
  const toast = useToast();
  const selection = useSelection();
  const [selectionMode, setSelectionMode] = useState(false);
  const [menuTarget, setMenuTarget] = useState<FileItem | null>(null);
  const { menuState, close: closeMenu, handlers } = useContextMenu();

  const onError = useCallback(() => {
    toast.error(tErrors("pageError"));
  }, [toast, tErrors]);

  const data = useInboxData(driveName, onError);
  const stages = useInboxStages(data.items);
  const pointerMode = usePointerMode();
  const isMobile = useIsMobile();
  // A coarse pointer below md triages by swipe and long press; the row's
  // button is not in the DOM there.
  const showRowDone = !(pointerMode === "coarse" && isMobile);

  useEffect(() => {
    if (selection.count === 0) setSelectionMode(false);
  }, [selection.count]);

  const showDoneToast = useCallback(
    (done: number, doneAts: readonly string[]) => {
      if (done <= 0) return;
      toast.success(t("markedDone", { count: done }), {
        action: {
          label: t("undo"),
          onClick: () => {
            void (async () => {
              let reopened = 0;
              try {
                for (const doneAt of doneAts) {
                  const answer = await undoInboxDone(driveName, doneAt);
                  reopened += answer.reopened;
                }
              } catch {
                onError();
                return;
              }
              await data.reload(reopened);
            })();
          },
        },
      });
    },
    [toast, t, driveName, onError, data],
  );

  const runDone = useCallback(
    async (ids: readonly string[]) => {
      if (ids.length === 0) return;
      data.hide(ids);
      let done = 0;
      const doneAts: string[] = [];
      try {
        for (const batch of batchesOf(ids, DONE_BATCH_SIZE)) {
          const answer = await markInboxDone(driveName, { file_ids: batch });
          done += answer.done;
          doneAts.push(answer.done_at);
        }
      } catch {
        data.restoreHidden(ids);
        onError();
        return;
      }
      data.settle(ids, done);
      showDoneToast(done, doneAts);
    },
    [driveName, data, onError, showDoneToast],
  );

  const handleMarkAllDone = useCallback(async () => {
    const upTo = data.items[0]?.arrived_at;
    if (!upTo) return;
    const loaded = data.items.map((item) => item.file.id);
    data.hide(loaded);
    try {
      const answer = await markInboxDone(driveName, { all: true, up_to: upTo });
      data.settle(loaded, answer.done);
      showDoneToast(answer.done, [answer.done_at]);
    } catch {
      data.restoreHidden(loaded);
      onError();
    }
  }, [driveName, data, onError, showDoneToast]);

  const handleLongPress = useCallback(
    (id: string) => {
      setSelectionMode(true);
      if (!selection.selectedIds.has(id)) selection.toggle(id);
    },
    [selection],
  );

  const handleToggle = useCallback(
    (id: string) => {
      selection.toggle(id);
    },
    [selection],
  );

  const openFileMenu = useCallback(
    (event: React.MouseEvent, item: InboxItem) => {
      setMenuTarget(item.file);
      handlers.onContextMenu(event);
    },
    [handlers],
  );

  return (
    <UploadZone
      drive={driveName}
      folderPath=""
      className="flex w-full min-w-0 flex-1 flex-col"
    >
      <InboxPresenter
        driveName={driveName}
        items={data.visibleItems}
        openCount={data.openCount}
        loading={data.loading}
        stages={stages}
        selectedIds={selection.selectedIds}
        selectionMode={selectionMode}
        showRowDone={showRowDone}
        sentinelRef={data.sentinelRef}
        onToggle={handleToggle}
        onDone={(id) => {
          void runDone([id]);
        }}
        onLongPress={handleLongPress}
        onContextMenu={openFileMenu}
        onMarkAllDone={() => {
          void handleMarkAllDone();
        }}
        onSelectionDone={(ids) => {
          void runDone(ids);
        }}
        onClearSelection={() => {
          selection.clear();
          setSelectionMode(false);
        }}
        onSelectAll={() => {
          selection.selectAll(data.visibleItems.map((item) => item.file.id));
        }}
        onReload={() => {
          void data.reload();
        }}
      />

      <FileContextMenu
        open={menuState.open}
        position={menuState.position}
        target={menuTarget}
        onClose={closeMenu}
        onUpdate={() => {
          void data.reload();
        }}
      />
    </UploadZone>
  );
}
