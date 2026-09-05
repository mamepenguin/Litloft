"use client";

import { useState, type ComponentType } from "react";
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

import { batchDelete, batchGetFiles, batchMove, batchPurge, batchRestore, batchTag } from "@/lib/api";
import { ActionMenuItem } from "./ActionMenuItem";
import { BatchRenameDialog } from "./BatchRenameDialog";
import { Button } from "./Button";
import { useClipboard } from "./ClipboardProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveDialog } from "./MoveDialog";
import { CollectionPicker } from "./CollectionPicker";

/**
 * One bulk action, written once and rendered two ways.
 *
 * The bar used to hold seven of these in a row that hid its own
 * scrollbar (`overflow-x-auto scrollbar-hide`), so at 375px four of them
 * were off the right-hand edge with nothing saying so — 00-basis 原則 5,
 * "what is cut off should look cut off". They are one list now: the first
 * `KEPT_ON_BAR` stay on the bar at every width and the rest move into
 * `…` below 640px, where they keep their labels. Fewer controls, not
 * nameless ones (00-basis, モバイルの寸法規則).
 */
interface BulkAction {
  id: string;
  icon: ComponentType<{ size?: number }>;
  /** The accessible name — a phrase, where the face carries a word. */
  label: string;
  /** The word on the face, when the name is longer than it should be. */
  displayLabel?: string;
  onClick: () => void;
  danger?: boolean;
  /** Draw a divider before this one: it opens a new group. */
  startsGroup?: boolean;
  /**
   * Stays on the bar at every width. Named rather than counted: the two
   * that stay are tagging and moving, and they are not adjacent — the
   * list's order serves the desktop grouping (edit / organize /
   * destructive), which a "first two" rule would have to break.
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
  onSelectAll: () => void;
  onClear: () => void;
  onComplete: () => void;
}

export function SelectionBar({
  count,
  selectedIds,
  totalCount,
  drive,
  currentPath,
  isTrashView,
  onSelectAll,
  onClear,
  onComplete,
}: SelectionBarProps) {
  const t = useTranslations("selection");
  const tf = useTranslations("file");
  const tc = useTranslations("common");
  const tcb = useTranslations("clipboard");
  const tt = useTranslations("trash");
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
    try {
      await batchPurge(ids);
      setPurgeOpen(false);
      onClear();
      onComplete();
    } catch {
      // keep dialog open
    }
  }

  async function handleBatchDelete() {
    try {
      await batchDelete(ids);
      setDeleteOpen(false);
      onClear();
      onComplete();
    } catch {
      // keep dialog open
    }
  }

  async function handleBatchMove(path: string) {
    try {
      await batchMove(ids, path);
      setMoveOpen(false);
      onClear();
      onComplete();
    } catch {
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
      await batchTag(ids, tags);
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

  // The one list. Order is the desktop grouping — edit, then organize,
  // then the destructive one — and `keepOnBar` picks what survives 375px.
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

  const onBar = actions.filter((a) => a.keepOnBar);
  const inOverflow = actions.filter((a) => !a.keepOnBar);

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up-bar"
        // PWA safe-area: viewport-fit=cover (layout.tsx) means the
        // viewport extends under the iOS home indicator. Without
        // this padding the bulk-action bar would tuck partially
        // under the home-bar and become unreachable.
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto max-w-3xl px-3 pb-3 sm:pb-4">
          <div className="overflow-hidden rounded-2xl bg-bg-card shadow-lg ring-1 ring-bg-border">
            {/* Header row: count + select all + close */}
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
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                >
                  <Check size={12} />
                  {t("selectAll")}
                </button>
              )}

              <button
                onClick={onClear}
                className="ml-auto rounded-2xl p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
                aria-label={t("deselect")}
              >
                <X size={16} />
              </button>
            </div>

            {/* Actions row. No `overflow-x-auto`, and nothing to scroll:
                what does not fit at 375px is in `…`, not off the edge. */}
            <div className="flex items-center gap-1 px-2 py-2">
              {tagging ? (
                <div className="flex items-center gap-1.5 rounded-2xl bg-bg-elevated px-2 py-1">
                  <Tag size={14} className="shrink-0 text-text-muted" />
                  <input
                    type="text"
                    autoFocus
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleBatchTag();
                      if (e.key === "Escape") setTagging(false);
                    }}
                    placeholder="tag1, tag2..."
                    className="w-24 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 outline-none sm:w-36"
                  />
                  {/* Not an accent fill. This bar floats over a folder, whose
                      Add button already holds the screen's one (DESIGN.md
                      §2.2). */}
                  <Button variant="secondary" size="sm" onClick={handleBatchTag}>
                    {tc("apply")}
                  </Button>
                  <Button
                    iconOnly
                    variant="ghost"
                    aria-label={tc("cancel")}
                    onClick={() => setTagging(false)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <>
                  {onBar.map((action) => (
                    <ActionButton key={action.id} action={action} />
                  ))}
                  {inOverflow.map((action) => (
                    <ActionButton
                      key={action.id}
                      action={action}
                      className="hidden sm:flex"
                      dividerClassName="hidden sm:block"
                    />
                  ))}
                  {inOverflow.length > 0 && (
                    <div className="relative sm:hidden">
                      <button
                        onClick={() => setMoreOpen((o) => !o)}
                        aria-haspopup="menu"
                        aria-expanded={moreOpen}
                        aria-label={t("moreActions")}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {moreOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            aria-hidden="true"
                            onClick={() => setMoreOpen(false)}
                          />
                          {/* Opens upward: the bar is pinned to the bottom. */}
                          <div
                            role="menu"
                            className="absolute bottom-full right-0 z-50 mb-2 min-w-[180px] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale"
                          >
                            {inOverflow.map((action) => (
                              <ActionMenuItem
                                key={action.id}
                                icon={action.icon}
                                label={action.displayLabel ?? action.label}
                                danger={action.danger}
                                onClick={() => {
                                  setMoreOpen(false);
                                  action.onClick();
                                }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={tt("moveToTrash")}
        message={tt("batchConfirmMoveToTrash", { count })}
        confirmLabel={tt("moveToTrash")}
        note={tt("autoDelete")}
        onConfirm={handleBatchDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={purgeOpen}
        title={tt("batchPurgeTitle")}
        message={tt("batchPurgeMessage", { count })}
        confirmLabel={tt("purge")}
        onConfirm={handleBatchPurge}
        onCancel={() => setPurgeOpen(false)}
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

function ActionButton({
  action,
  className = "",
  dividerClassName = "",
}: {
  action: BulkAction;
  /** Layout only — which widths this one appears at. */
  className?: string;
  /** Applied to the group divider, so it hides with what it separates. */
  dividerClassName?: string;
}) {
  const Icon = action.icon;
  const colorClass = action.danger
    ? "text-danger hover:bg-accent/10 active:bg-accent/15"
    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary active:bg-bg-elevated";

  return (
    <>
      {action.startsGroup && <ActionDivider className={dividerClassName} />}
      <button
        onClick={action.onClick}
        // `min-h-11` rather than a hit-area overhang: these sit shoulder to
        // shoulder, and DESIGN.md §Row Actions says adjacent pseudo-elements
        // overlap, the later one winning — every control then keeps less than
        // it looks like it has. Growing the box is safe where growing the
        // overhang is not.
        className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm transition-colors pointer-coarse:min-h-11 ${colorClass} ${className}`}
        aria-label={action.label}
      >
        <Icon size={15} />
        <span className="hidden sm:inline">{action.displayLabel ?? action.label}</span>
      </button>
    </>
  );
}

function ActionDivider({ className = "" }: { className?: string }) {
  return <div className={`mx-0.5 h-5 w-px shrink-0 bg-bg-border ${className}`} />;
}
