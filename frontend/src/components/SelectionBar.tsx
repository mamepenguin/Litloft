"use client";

import { useRef, useState, type ComponentType } from "react";
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
export interface BulkAction {
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

/**
 * Does the group opening at `index` still have something on the bar at
 * 375px?
 *
 * A divider is drawn there only if it does — otherwise the rule before the
 * destructive group trails the last visible button with nothing after it.
 *
 * Exported because the scan stops at the *next* group, and the bar's own
 * action list cannot tell that apart from a scan that runs to the end: no
 * group in it is empty at 375px while a later one is not. Deleting the
 * stop changed no rendered output and failed no test. A rule that cannot
 * be wrong against the only data it sees is a rule nothing is checking, so
 * it is checked against data written for it.
 */
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
  const moreRef = useRef<HTMLButtonElement>(null);

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

  const inOverflow = actions.filter((a) => !a.keepOnBar);

  const closeMore = () => {
    setMoreOpen(false);
    // The row that was focused unmounts with the menu; without this, focus
    // lands on <body>. `AddButton` and `FileActions` both carry this.
    moreRef.current?.focus();
  };

  const overflowMenu =
    moreOpen && inOverflow.length > 0 ? (
      <>
        <div
          className="fixed inset-0 z-20 sm:hidden"
          aria-hidden="true"
          onClick={closeMore}
        />
        {/* Opens upward: the bar is pinned to the bottom. Positioned against
            the wrapper outside the card, so the card's `overflow-hidden` has
            nothing to clip. `z-30` is the tier DESIGN.md §Layering gives a
            popover anchored to a control, and the same one `AddButton` and
            `FileActions` use. */}
        <div
          role="menu"
          className="absolute bottom-full right-3 z-30 mb-2 min-w-[200px] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:hidden"
        >
          {inOverflow.map((action) => (
            <ActionMenuItem
              key={action.id}
              icon={action.icon}
              // The name, not the face's short word: a menu row has room,
              // and an action whose accessible name shrinks on a phone is
              // two different names for one thing.
              label={action.label}
              danger={action.danger}
              onClick={() => {
                closeMore();
                action.onClick();
              }}
            />
          ))}
        </div>
      </>
    ) : null;

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
        {/* `relative` here, one level *outside* the card. The overflow menu
            hangs off this, not off the card: the card is `overflow-hidden`
            for its rounded corners, and an `absolute` box does not escape an
            ancestor's clip the way a `fixed` one does. Anchored inside it,
            three of the five rows were drawn where nothing could paint them
            and no gesture could reach them — worse than the sideways scroll
            this menu replaced, and the one row left whole was the
            destructive one. `menuClipTest` in `SelectionBar.test.tsx` walks
            the ancestors so this cannot come back. */}
        <div className="relative mx-auto max-w-3xl px-3 pb-3 sm:pb-4">
          {overflowMenu}
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
                what does not fit at 375px is in `…`, not off the edge.
                Drawn in list order at every width — an earlier draft put the
                two kept on the bar first, which moved Move from sixth to
                second and left it inside the *edit* group, breaking the
                grouping this file's own comment says the order exists to
                serve. */}
            <div className="flex items-center gap-1 px-2 py-2">
              {actions.map((action) => {
                // Tagging replaces its own button and nothing else. Wrapping
                // the whole row in the branch emptied the bar of the other
                // six actions, at every width.
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
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleBatchTag();
                          if (e.key === "Escape") setTagging(false);
                        }}
                        placeholder="tag1, tag2..."
                        className="w-24 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 outline-none sm:w-36"
                      />
                      {/* Not an accent fill. This bar floats over a folder,
                          whose Add button already holds the screen's one
                          (DESIGN.md §2.2). */}
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
                  );
                }
                return (
                  <ActionButton
                    key={action.id}
                    action={action}
                    keepDividerNarrow={groupSurvivesNarrow(actions, actions.indexOf(action))}
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

/**
 * The class that hides an action below 640px, and the attribute that says
 * so, from one expression.
 *
 * A test cannot read `display` in jsdom, and reading the class list for the
 * literal token `hidden` is not a proxy for it — `max-sm:hidden` hides
 * without that token and `max-sm:!flex` shows despite it. Both were tried
 * against the first version of this file's tests and both passed. So the
 * component states its own membership, and the test pins the visibility
 * classes exactly rather than searching them.
 */
function visibility(action: BulkAction) {
  return action.keepOnBar
    ? { className: "", "data-bar": "always" as const }
    : { className: "hidden sm:flex", "data-bar": "wide" as const };
}

function ActionButton({
  action,
  keepDividerNarrow,
}: {
  action: BulkAction;
  /** Whether the group this one opens still has something on the bar at 375px. */
  keepDividerNarrow: boolean;
}) {
  const Icon = action.icon;
  const { className, "data-bar": bar } = visibility(action);
  const colorClass = action.danger
    ? "text-danger hover:bg-accent/10 active:bg-accent/15"
    : "text-text-muted hover:bg-bg-elevated hover:text-text-primary active:bg-bg-elevated";

  return (
    <>
      {action.startsGroup && (
        <ActionDivider className={keepDividerNarrow ? "" : "hidden sm:block"} />
      )}
      <button
        data-bar={bar}
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
        {/* Not `hidden sm:inline`. The two that stay at 375px stayed as
            nameless icons under that class, which is the thing this whole
            change is against — fewer controls, not nameless ones. The ones
            that leave the bar are `display:none` there anyway, so showing
            their word costs nothing. */}
        <span>{action.displayLabel ?? action.label}</span>
      </button>
    </>
  );
}

function ActionDivider({ className = "" }: { className?: string }) {
  return <div className={`mx-0.5 h-5 w-px shrink-0 bg-bg-border ${className}`} />;
}
