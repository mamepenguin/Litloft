"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { flushSync } from "react-dom";
import {
  Check,
  ClipboardCopy,
  ListMusic,
  MoreHorizontal,
  Move,
  Pencil,
  RotateCcw,
  Scissors,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  batchDelete,
  batchGetFiles,
  batchMove,
  batchPurge,
  batchRestore,
  batchTag,
  type RequestOptions,
} from "@/lib/api";
import { runChunked, type BatchAnswer } from "@/lib/batchChunks";
import { useImeKeyGuard } from "@/lib/ime";
import { ActionMenuItem } from "./ActionMenuItem";
import { BatchRenameDialog } from "./BatchRenameDialog";
import { Button } from "./Button";
import { useClipboard } from "./ClipboardProvider";
import { useToast } from "./ToastProvider";
import {
  isSubtitleRefusal,
  sidecarErrorMessage,
  subtitleFailure,
} from "@/lib/subtitleErrors";
import { ConfirmDialog } from "./ConfirmDialog";
import { DismissScrim } from "./DismissScrim";
import { MoveDialog } from "./MoveDialog";
import { CollectionPicker } from "./CollectionPicker";

export interface BulkAction {
  id: string;
  icon: ComponentType<{ size?: number }>;
  label: string;
  displayLabel?: string;
  onClick: () => void;
  danger?: boolean;
  startsGroup?: boolean;
  /**
   * Named rather than counted: the two that stay are not adjacent — the
   * list's order serves the desktop grouping, which a "first two" rule
   * would have to break.
   */
  keepOnBar?: boolean;
}

interface SelectionBarProps {
  count: number;
  selectedIds: Set<string>;
  totalCount: number;
  drive: string;
  currentPath?: string;
  isTrashView?: boolean;
  /** The inbox closes its rows as done, and files still land in the drive. */
  isInboxView?: boolean;
  onInboxDone?: (ids: string[]) => void;
  onSelectAll: () => void;
  onClear: () => void;
  /** `removed` is true when the files left the drive's listing (trash or purge). */
  onComplete: (removed?: boolean) => void;
  /** Held when a batch run ends partial or stopped: the failed and unconfirmed ids. */
  onSelectOnly?: (ids: string[]) => void;
  /** The ids a batch run processed; the parent drops their rows. */
  onProcessed?: (ids: string[]) => void;
}

/** The server accepts at most 100 ids per batch. */
const INBOX_BATCH_SIZE = 100;

function inBatches<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

export function groupSurvivesNarrow(
  actions: ReadonlyArray<Pick<BulkAction, "startsGroup" | "keepOnBar">>,
  index: number,
): boolean {
  for (let i = index; i < actions.length; i++) {
    if (i > index && actions[i].startsGroup) break;
    if (actions[i].keepOnBar) return true;
  }
  return false;
}

export function SelectionBar({
  count,
  selectedIds,
  totalCount,
  drive,
  currentPath,
  isTrashView,
  isInboxView,
  onInboxDone,
  onSelectAll,
  onClear,
  onComplete,
  onSelectOnly,
  onProcessed,
}: SelectionBarProps) {
  const t = useTranslations("selection");
  const tf = useTranslations("file");
  const tc = useTranslations("common");
  const tcb = useTranslations("clipboard");
  const tt = useTranslations("trash");
  const ti = useTranslations("inbox");
  const ts = useTranslations("subtitles");
  const te = useTranslations("subtitles.errors");
  const ime = useImeKeyGuard();
  const toast = useToast();
  const clipboard = useClipboard();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFiles, setRenameFiles] = useState<{ id: string; filename: string }[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagging, setTagging] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const [running, setRunning] = useState(false);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [outcome, setOutcome] = useState<{ text: string; retryLine: string | null } | null>(null);
  const [retryArmed, setRetryArmed] = useState(false);
  const [runIsRetry, setRunIsRetry] = useState(false);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (count === 0) return null;

  const ids = Array.from(selectedIds);
  const allSelected = count >= totalCount;

  async function handleBatchRestore() {
    try {
      await batchRestore(ids);
      onClear();
      onComplete();
    } catch {
      // ignore
    }
  }

  async function handleBatchPurge() {
    await runBatch(
      (chunk, options) => batchPurge(chunk, options),
      () => setPurgeOpen(false),
    );
  }

  async function handleBatchDelete() {
    await runBatch(
      (chunk, options) => batchDelete(chunk, options),
      () => setDeleteOpen(false),
    );
  }

  type BatchRequest = (chunk: string[], options: RequestOptions) => Promise<BatchAnswer>;

  async function runBatch(send: BatchRequest, close: () => void) {
    // A second confirm while one run is in flight must not send its chunks.
    if (runningRef.current) return;
    runningRef.current = true;
    const runIds = ids;
    const retryRun = retryArmed;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setRunIsRetry(retryRun);
    setOutcome(null);
    setProgressDone(0);
    setProgressTotal(runIds.length);

    const result = await runChunked(
      runIds,
      (chunk, signal) => send(chunk, { signal }),
      { onProgress: setProgressDone, signal: controller.signal },
    );

    runningRef.current = false;
    abortRef.current = null;
    // Unmounted: the selection store and the parent's list are what is left,
    // and they are not ours to write after this component is gone.
    if (controller.signal.aborted) return;
    setRunning(false);

    const processedSet = new Set(result.processed);
    const kept = runIds.filter((id) => !processedSet.has(id));
    if (result.stopped || result.failed.length > 0) {
      onSelectOnly?.(kept);
      onProcessed?.(result.processed);
      setRetryArmed(true);
      setOutcome({
        text: result.stopped
          ? t("stopped", { done: result.processed.length, remaining: kept.length })
          : t("partial", { done: result.processed.length, failed: result.failed.length }),
        retryLine: retryRun ? t("retryNote") : null,
      });
      onComplete(true);
      return;
    }

    setOutcome(null);
    setRetryArmed(false);
    setRunIsRetry(false);
    close();
    onClear();
    onComplete(true);
  }

  function dismiss(close: () => void) {
    if (runningRef.current) return;
    close();
    setOutcome(null);
    setRetryArmed(false);
    setRunIsRetry(false);
  }

  async function handleBatchMove(path: string) {
    try {
      const errors = [];
      const carried: string[] = [];
      if (isInboxView) {
        for (const batch of inBatches(ids, INBOX_BATCH_SIZE)) {
          const answer = await batchMove(batch, path);
          errors.push(...answer.errors);
          carried.push(...(answer.sidecar_errors ?? []));
        }
      } else {
        const answer = await batchMove(ids, path);
        errors.push(...answer.errors);
        carried.push(...(answer.sidecar_errors ?? []));
      }
      const skipped = errors.filter((entry) =>
        isSubtitleRefusal(entry.error),
      ).length;
      if (skipped > 0) {
        toast.error(ts("moveSkipped", { count: skipped }));
      }
      if (carried.length > 0) {
        toast.error(sidecarErrorMessage(ts, carried));
      }
      setMoveOpen(false);
      onClear();
      onComplete();
    } catch (cause) {
      const subtitle = subtitleFailure(cause, te);
      if (subtitle) toast.error(subtitle);
      // keep dialog open
    }
  }

  async function handleBatchTag() {
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;
    try {
      if (isInboxView) {
        for (const batch of inBatches(ids, INBOX_BATCH_SIZE)) {
          await batchTag(batch, tags);
        }
      } else {
        await batchTag(ids, tags);
      }
      setTagInput("");
      setTagging(false);
      onClear();
      onComplete();
    } catch {
      // keep input open
    }
  }

  async function handleOpenRename() {
    try {
      const files = await batchGetFiles(ids);
      setRenameFiles(files.map((f) => ({ id: f.id, filename: f.filename })));
      setRenameOpen(true);
    } catch {
      // ignore
    }
  }

  function handleRenameComplete() {
    setRenameOpen(false);
    setRenameFiles([]);
    onClear();
    onComplete();
  }

  function handleInboxDone() {
    if (!onInboxDone) return;
    onInboxDone(ids);
    onClear();
    onComplete();
  }

  const actions: BulkAction[] = isTrashView
    ? [
        {
          id: "restore",
          icon: RotateCcw,
          label: tt("restore"),
          onClick: handleBatchRestore,
          keepOnBar: true,
        },
        {
          id: "purge",
          icon: Trash2,
          label: tt("purge"),
          onClick: () => setPurgeOpen(true),
          danger: true,
          startsGroup: true,
          keepOnBar: true,
        },
      ]
    : isInboxView
      ? [
          {
            id: "done",
            icon: Check,
            label: ti("done"),
            onClick: handleInboxDone,
            keepOnBar: true,
          },
          {
            id: "tag",
            icon: Tag,
            label: t("tagging"),
            displayLabel: t("tag"),
            onClick: () => flushSync(() => setTagging(true)),
            keepOnBar: true,
            startsGroup: true,
          },
          {
            id: "move",
            icon: Move,
            label: tc("move"),
            onClick: () => setMoveOpen(true),
            keepOnBar: true,
          },
        ]
      : [
        {
          id: "tag",
          icon: Tag,
          label: t("tagging"),
          displayLabel: t("tag"),
          onClick: () => setTagging(true),
          keepOnBar: true,
        },
        {
          id: "rename",
          icon: Pencil,
          label: t("rename"),
          onClick: handleOpenRename,
        },
        {
          id: "collection",
          icon: ListMusic,
          label: tf("addToCollection"),
          displayLabel: t("collection"),
          onClick: () => setCollectionPickerOpen(true),
          startsGroup: true,
        },
        {
          id: "copy",
          icon: ClipboardCopy,
          label: tcb("copy"),
          onClick: () => {
            clipboard.copy(ids, drive, currentPath ?? "");
            onClear();
          },
        },
        {
          id: "cut",
          icon: Scissors,
          label: tcb("cut"),
          onClick: () => {
            clipboard.cut(ids, drive, currentPath ?? "");
            onClear();
          },
        },
        {
          id: "move",
          icon: Move,
          label: tc("move"),
          onClick: () => setMoveOpen(true),
          keepOnBar: true,
        },
        {
          id: "trash",
          icon: Trash2,
          label: tt("moveToTrash"),
          onClick: () => setDeleteOpen(true),
          danger: true,
          startsGroup: true,
        },
      ];

  const inOverflow = actions.filter((a) => !a.keepOnBar);

  const closeMore = () => {
    setMoreOpen(false);
    // The row that was focused unmounts with the menu; without this, focus
    // lands on <body>.
    moreRef.current?.focus();
  };

  const overflowMenu =
    moreOpen && inOverflow.length > 0 ? (
      <DismissScrim
        onDismiss={closeMore}
        className="fixed inset-0 z-20 sm:hidden"
      >
        {/* `right-3` pins it to the card's right edge rather than to the
            trigger: following the trigger means computing a position again,
            which is what put this menu inside the clipping card. */}
        <div
          role="menu"
          className="absolute bottom-full right-3 z-30 mb-2 min-w-[200px] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg sm:hidden"
        >
          {inOverflow.map((action) => (
            <ActionMenuItem
              key={action.id}
              icon={action.icon}
              label={action.label}
              danger={action.danger}
              onClick={() => {
                closeMore();
                action.onClick();
              }}
            />
          ))}
        </div>
      </DismissScrim>
    ) : null;

  function runLabels(normalMessage: string, normalLabel: string) {
    const retrying = retryArmed || (running && runIsRetry);
    return {
      busy: running,
      progress: running
        ? t("progress", { done: progressDone, total: progressTotal })
        : undefined,
      error: outcome?.retryLine ?? undefined,
      message: outcome
        ? outcome.text
        : retrying
          ? t("retryMessage", { remaining: count })
          : normalMessage,
      confirmLabel: retrying ? t("processRemaining") : normalLabel,
    };
  }

  const deleteRun = runLabels(
    tt("batchConfirmMoveToTrash", { count }),
    tt("moveToTrash"),
  );
  const purgeRun = runLabels(tt("batchPurgeMessage", { count }), tt("purge"));

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up-bar"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* `relative` here, one level *outside* the card. The card is
            `overflow-hidden` for its rounded corners, and an `absolute` box
            does not escape an ancestor's clip the way a `fixed` one does. */}
        <div className="relative mx-auto max-w-3xl px-3 pb-3 sm:pb-4">
          {overflowMenu}
          <div className="overflow-hidden rounded-2xl bg-bg-card shadow-lg ring-1 ring-bg-border">
            <div className="flex items-center gap-3 border-b border-bg-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent/15 px-2 text-xs font-semibold tabular-nums text-accent">
                  {count}
                </span>
                <span className="text-sm font-medium text-text-primary">
                  {t("selected", { count })}
                </span>
              </div>

              {!allSelected && (
                <button
                  onClick={onSelectAll}
                  disabled={running}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors enabled:hover:bg-accent/10 disabled:cursor-not-allowed disabled:text-warm-silver"
                >
                  <Check size={12} />
                  {t("selectAll")}
                </button>
              )}

              <button
                onClick={() => flushSync(onClear)}
                disabled={running}
                className="ml-auto rounded-2xl p-1.5 text-text-muted transition-colors enabled:hover:bg-bg-elevated enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:text-warm-silver"
                aria-label={t("deselect")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-1 px-2 py-2">
              {actions.map((action, index) => {
                if (action.id === "tag" && tagging) {
                  return (
                    <div
                      key={action.id}
                      className="flex items-center gap-1.5 rounded-2xl bg-bg-elevated px-2 py-1"
                    >
                      <Tag size={14} className="shrink-0 text-text-muted" />
                      <input
                        type="text"
                        autoFocus
                        value={tagInput}
                        disabled={running}
                        onChange={(e) => setTagInput(e.target.value)}
                        onCompositionEnd={ime.onCompositionEnd}
                        onKeyDown={(e) => {
                          if (ime.isImeKeystroke(e)) return;
                          if (e.key === "Enter") handleBatchTag();
                          if (e.key === "Escape") setTagging(false);
                        }}
                        placeholder="tag1, tag2..."
                        className="w-24 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 outline-none disabled:cursor-not-allowed disabled:text-warm-silver sm:w-36"
                      />
                      {/* Not an accent fill. This bar floats over a folder,
                          whose Add button already holds the screen's one. */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleBatchTag}
                        disabled={running}
                      >
                        {tc("apply")}
                      </Button>
                      <Button
                        iconOnly
                        variant="ghost"
                        aria-label={tc("cancel")}
                        onClick={() => setTagging(false)}
                        disabled={running}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  );
                }
                return (
                  <ActionButton
                    key={action.id}
                    action={action}
                    keepDividerNarrow={groupSurvivesNarrow(actions, index)}
                    disabled={running}
                  />
                );
              })}

              {inOverflow.length > 0 && (
                <button
                  ref={moreRef}
                  onClick={() => setMoreOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-label={t("moreActions")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary sm:hidden"
                >
                  <MoreHorizontal size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={tt("moveToTrash")}
        message={deleteRun.message}
        confirmLabel={deleteRun.confirmLabel}
        note={tt("autoDelete")}
        busy={deleteRun.busy}
        progress={deleteRun.progress}
        error={deleteRun.error}
        onConfirm={handleBatchDelete}
        onCancel={() => dismiss(() => setDeleteOpen(false))}
      />

      <ConfirmDialog
        open={purgeOpen}
        title={tt("batchPurgeTitle")}
        message={purgeRun.message}
        confirmLabel={purgeRun.confirmLabel}
        busy={purgeRun.busy}
        progress={purgeRun.progress}
        error={purgeRun.error}
        onConfirm={handleBatchPurge}
        onCancel={() => dismiss(() => setPurgeOpen(false))}
      />

      <MoveDialog
        open={moveOpen}
        drive={drive}
        currentPath={currentPath ?? ""}
        onMove={handleBatchMove}
        onCancel={() => setMoveOpen(false)}
      />

      <CollectionPicker
        open={collectionPickerOpen}
        drive={drive}
        fileIds={ids}
        onClose={() => setCollectionPickerOpen(false)}
      />

      <BatchRenameDialog
        open={renameOpen}
        files={renameFiles}
        onComplete={handleRenameComplete}
        onCancel={() => setRenameOpen(false)}
      />
    </>
  );
}

function visibility(action: BulkAction) {
  return action.keepOnBar
    ? { className: "", "data-bar": "always" as const }
    : { className: "hidden sm:flex", "data-bar": "wide" as const };
}

function ActionButton({
  action,
  keepDividerNarrow,
  disabled,
}: {
  action: BulkAction;
  keepDividerNarrow: boolean;
  disabled: boolean;
}) {
  const Icon = action.icon;
  const { className, "data-bar": bar } = visibility(action);
  const colorClass = action.danger
    ? "text-danger hover:bg-accent/10 active:bg-accent/15"
    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary active:bg-bg-elevated";
  // Only while running: a disabled control drops its enabled colour rather
  // than fading, and the idle recipe must stay exactly as it is.
  const disabledClass = disabled
    ? "disabled:cursor-not-allowed disabled:text-warm-silver"
    : "";

  return (
    <>
      {action.startsGroup && (
        <ActionDivider className={keepDividerNarrow ? "" : "hidden sm:block"} />
      )}
      <button
        data-bar={bar}
        onClick={action.onClick}
        disabled={disabled}
        // `min-h-11` rather than a hit-area overhang: these sit shoulder to
        // shoulder, and adjacent pseudo-elements overlap, the later one winning.
        className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm transition-colors pointer-coarse:min-h-11 ${colorClass} ${disabledClass} ${className}`}
        aria-label={action.label}
      >
        <Icon size={15} />
        <span>{action.displayLabel ?? action.label}</span>
      </button>
    </>
  );
}

function ActionDivider({ className = "" }: { className?: string }) {
  return <div className={`mx-0.5 h-5 w-px shrink-0 bg-bg-border ${className}`} />;
}
