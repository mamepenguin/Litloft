"use client";

import { useCallback, useLayoutEffect, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";

import { useTranslations } from "next-intl";
import {
  deleteFile,
  moveFile,
  renameFile,
} from "@/lib/api";
import { useFileMenuItems } from "@/hooks/useFileMenuItems";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import type { FileItem } from "@/types";
import { ActionMenuItem } from "./ActionMenuItem";
import { useDialogPortalTarget } from "./DialogPortal";
import { AddonSlot } from "./AddonSlot";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { MoveDialog } from "./MoveDialog";
import { CollectionPicker } from "./CollectionPicker";

/** Must match the menu's `w-40`; used to decide which side it opens on. */
const MENU_WIDTH_PX = 160;

/**
 * The menu's `mt-1` / `mb-1`, in pixels. The gap is part of the room the
 * menu needs, so it belongs inside the comparison: without it a menu whose
 * height lands in the last 4px of the space below is kept downward and its
 * final pixels sit past the edge.
 *
 * Exported so the claim is checkable rather than asserted here in prose:
 * `fileActionsMenuFixtureParity.test.tsx` pins it against the number the
 * layout fixture builds its boxes from, and `e2e-layout` measures the gap
 * Chromium actually leaves against that same number.
 */
export const MENU_GAP_PX = 4;

interface FileActionsProps {
  file: FileItem;
  onUpdate?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  /**
   * File context handed to the `file-actions-menu` slot, and the opt-in
   * that renders the slot at all: an entry cannot do anything useful
   * without knowing which file it is acting on, so a call site with no
   * context to give gets no addon entries. Today only the file detail page
   * passes it.
   */
  addonProps?: Record<string, unknown>;
}

export function FileActions({
  file,
  onUpdate,
  onDelete,
  onEdit,
  addonProps,
}: FileActionsProps) {
  const t = useTranslations("file");
  const tt = useTranslations("trash");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [addonDialogOpen, setAddonDialogOpen] = useState(false);
  // document.body everywhere except inside the mobile Bottom Sheet,
  // which hands out a host in its own subtree — see DialogPortal.
  const dialogHost = useDialogPortalTarget();
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Which corner of the trigger the menu hangs from, on both axes.
  //
  // Both are measured against the menu's first clipping ancestor, falling
  // back to the visual viewport when it has none: what bounds the menu is
  // the enclosing column, not the window — and where the window is the
  // bound, the visual viewport is the part of it an on-screen keyboard or
  // a collapsing URL bar leaves visible. Hanging below and to one side is
  // right wherever the trigger has the room; in the Bottom Sheet's resting
  // strip (`fixed bottom-0`, DESIGN.md §Layering) it has none below, so a
  // menu that only ever opened downward was drawn below the viewport.
  //
  // Measured against the rendered box rather than a breakpoint or a
  // guessed row count, because the menu's height is the addon slot's to
  // change and no constant here would follow it.
  //
  // Neither flag is cleared when the menu closes: the error toast hangs
  // off the same trigger and is raised after the menu has gone, so a reset
  // would put the message in the corner the menu was not allowed to use.
  // Both are re-derived on every open, so a stale value never outlives one
  // paint.
  const [alignLeft, setAlignLeft] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const menuBoxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!menuOpen) {
      // The flag belongs to a subtree that only exists while the menu is
      // open, and it is set by an addon in another repository. Clearing it
      // here means a caller that forgets `onDialogOpenChange(false)` cannot
      // strand `anyDialogOpen` at true and leave the menu unclosable.
      setAddonDialogOpen(false);
      return;
    }

    const measure = () => {
      const trigger = menuRef.current;
      const menuBox = menuBoxRef.current;
      if (!trigger || !menuBox) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuHeight = menuBox.getBoundingClientRect().height;

      // The first ancestor that *clips this menu* — which is not the same
      // as the first ancestor with an `overflow` value. An overflow box
      // clips a positioned descendant only while it is still in that
      // descendant's containing-block chain, and the chain leaves the DOM
      // parentage twice:
      //
      //   - at a `fixed` ancestor. It is laid out against the viewport, so
      //     nothing above it clips the subtree. The resting strip this fix
      //     exists for is exactly that (`fixed bottom-0`), so without the
      //     stop a scroller anywhere above the shell would hand both axes
      //     a box the strip is not inside.
      //   - at an `absolute` ancestor, and then only as far as *its* own
      //     containing block: the nearest positioned ancestor. Static
      //     boxes in between are not in the chain and do not clip. Once
      //     that positioned ancestor is reached the detour is over — a
      //     `relative` or `sticky` box is itself in flow, so statics above
      //     it clip again; an `absolute` one starts a fresh detour.
      //
      // The exception this does not implement is an ancestor with
      // `transform` / `filter` / `contain`, which becomes the containing
      // block of even a `fixed` descendant. vaul's drawer is one, and the
      // menu is not inside it in the state this decision is about — at
      // rest the strip is drawn outside the drawer.
      let bounds: { left: number; top: number; bottom: number } | null = null;
      // Set while the walk is between an `absolute` ancestor and that
      // ancestor's containing block, where only a positioned box counts.
      let inAbsoluteDetour = false;
      for (let el = trigger.parentElement; el; el = el.parentElement) {
        const { overflowX, overflowY, position } = getComputedStyle(el);
        // Positive test rather than `!== "static"`: an unset `position`
        // reads as `""` outside a browser, and the whole point of the flag
        // is that a *static* box inside the detour cannot clip.
        const positioned =
          position === "relative" ||
          position === "absolute" ||
          position === "fixed" ||
          position === "sticky";
        if (
          (positioned || !inAbsoluteDetour) &&
          /auto|scroll|hidden/.test(overflowX + overflowY)
        ) {
          const rect = el.getBoundingClientRect();
          bounds = { left: rect.left, top: rect.top, bottom: rect.bottom };
          break;
        }
        if (position === "fixed") break;
        // Only a positioned box moves the flag: it is the one that ends a
        // detour, or starts one. A static ancestor leaves it alone, which
        // is what keeps the detour running across the statics inside it.
        if (positioned) inAbsoluteDetour = position === "absolute";
      }
      // `window.innerHeight` is the layout viewport, which the keyboard
      // does not move; `visualViewport` is what is actually on screen.
      const frame = bounds ?? {
        left: 0,
        top: 0,
        bottom: window.visualViewport?.height ?? window.innerHeight,
      };

      setAlignLeft(triggerRect.right - MENU_WIDTH_PX < frame.left);

      // `triggerRect` is the wrapper's, which the menu — being absolute,
      // out of flow — does not move, and the menu's height is the same
      // whichever direction it is drawn in. So the reading does not depend
      // on the answer it feeds.
      //
      // The gap is counted once. `mt-1` and `mb-1` are the same 4px, so it
      // cancels out of `spaceAbove > spaceBelow` and decides only whether
      // the menu fits below at all. Flips only when the space above is the
      // better of the two, so a trigger with room for neither keeps the
      // downward direction the menu reads as everywhere else.
      const spaceBelow = frame.bottom - triggerRect.bottom;
      const spaceAbove = triggerRect.top - frame.top;
      setOpenUp(
        menuHeight + MENU_GAP_PX > spaceBelow && spaceAbove > spaceBelow,
      );
    };

    measure();

    // The height is not settled on the commit that opens the menu.
    // `AddonSlot` resolves a dynamic `import()` inside an effect and
    // renders null until it lands, so the first open after a page load
    // sees a menu with no addon rows in it — the same wrong number the
    // guessed row count would have given. Following the box is what makes
    // measuring it worth anything.
    //
    // Flipping cannot re-enter this: `bottom-full mb-1` and `top-full
    // mt-1` move the menu, they do not resize it, and a ResizeObserver
    // reports a changed box rather than a changed position.
    const menuBox = menuBoxRef.current;
    if (!menuBox || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(menuBox);
    return () => observer.disconnect();
  }, [menuOpen]);

  const anyDialogOpen =
    renameOpen || moveOpen || deleteOpen || addonDialogOpen;

  useEffect(() => {
    if (!menuOpen || anyDialogOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen, anyDialogOpen]);

  // A popup must be dismissable from the keyboard. Without this the only
  // ways out are an outside click or picking an item, so a keyboard user
  // who opens the menu cannot back out of it.
  //
  // On the stack, not on `document`: the menu can open a dialog, and two
  // listeners would answer one press. `anyDialogOpen` already keeps it
  // from firing then, but push order is what makes that true for the
  // next thing to open over it as well.
  useShortcuts(
    "file-actions-menu",
    "Dialog",
    [
      {
        key: "escape",
        label: "Close",
        editingOnly: false,
        hidden: true,
        handler: () => {
          setMenuOpen(false);
          triggerRef.current?.focus();
        },
      },
    ],
    menuOpen && !anyDialogOpen,
    OVERLAY_PRIORITY,
  );

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleRename = useCallback(
    async (newName: string) => {
      try {
        await renameFile(file.id, newName);
        setRenameOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError(t("renameFailed"));
      }
    },
    [file.id, onUpdate, t]
  );

  const handleMove = useCallback(
    async (targetPath: string) => {
      try {
        await moveFile(file.id, targetPath);
        setMoveOpen(false);
        if (onUpdate) onUpdate();
      } catch {
        setError(t("moveFailed"));
      }
    },
    [file.id, onUpdate, t]
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteFile(file.id);
      setDeleteOpen(false);
      if (onDelete) onDelete();
    } catch {
      setError(t("deleteFailed"));
    }
  }, [file.id, onDelete, t]);

  // Every surface's menu comes from here, including this one. It used
  // to build its own array, which is how it ended up without
  // "add to collection" at all — the entry the card and list menus both
  // had. Each handler closes the menu first: the dialogs portal out of
  // this subtree, and leaving it open would stack a menu over them.
  const menuItems = useFileMenuItems(file, {
    onEdit: onEdit
      ? () => {
          setMenuOpen(false);
          onEdit();
        }
      : undefined,
    onAddToCollection: () => {
      setMenuOpen(false);
      setCollectionPickerOpen(true);
    },
    onRename: () => {
      setMenuOpen(false);
      setRenameOpen(true);
    },
    onMove: () => {
      setMenuOpen(false);
      setMoveOpen(true);
    },
    onTrash: () => {
      setMenuOpen(false);
      setDeleteOpen(true);
    },
  });

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          ref={triggerRef}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          // The touch floor on the control, because the row's rule cannot
          // reach it: `.file-action-row-touch > *` grows the *direct child*,
          // and this button sits inside the `.relative` wrapper the menu
          // needs — so the wrapper became 44x44 and the button stayed 28x28.
          // §Row Actions asks for exactly this ("give the row's own controls
          // the same class wherever alignment stops them inheriting that
          // height"); `addons/knowledge/frontend/MediaCaptureAction.tsx` is
          // the shape being copied, centring included. `p-1.5` has no
          // `display`, so `h-11 w-11` alone would leave the glyph against the
          // left padding edge — measured 6/14/22/14 instead of 14 all round.
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("actions")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>

        {menuOpen && (
          <div
            ref={menuBoxRef}
            role="menu"
            className={`absolute z-30 w-40 overflow-hidden rounded-2xl border border-bg-border bg-bg-card shadow-lg ${
              openUp ? "bottom-full mb-1" : "top-full mt-1"
            } ${alignLeft ? "left-0" : "right-0"}`}
          >
            {menuItems.map((item) => (
              <ActionMenuItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                onClick={item.onClick}
                disabled={item.disabled}
                danger={item.danger}
              />
            ))}
            {addonProps && (
              /* `empty:hidden` carries the separator: no addon claims this
                 slot on a stock install, and an entry that does claim it may
                 still render nothing for a given file. Either way the rule
                 would otherwise float under the last core item with nothing
                 beneath it.

                 An entry here must NOT close the menu when it opens a
                 dialog: closing unmounts this subtree, taking the dialog
                 with it. Entries open their dialog, report it through
                 `onDialogOpenChange` so the outside-click and Escape
                 listeners stand down, and call `onRequestClose` only once
                 the dialog is dismissed. */
              <div
                /* Presentational: the menuitems inside must read as direct
                   children of role="menu", and the rule itself is decoration. */
                role="none"
                className="mt-1 border-t border-bg-border pt-1 empty:hidden"
              >
                <AddonSlot
                  id="file-actions-menu"
                  layout="stack"
                  props={{
                    ...addonProps,
                    onRequestClose: () => {
                      setAddonDialogOpen(false);
                      setMenuOpen(false);
                      // The entry that had focus is about to unmount with
                      // the menu; without this, focus lands on <body>.
                      triggerRef.current?.focus();
                    },
                    onDialogOpenChange: setAddonDialogOpen,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            /* Both axes follow the menu's, per DESIGN.md §Context Menus /
               Dropdowns. This box does not wrap, so its width is whatever
               the message is: on a trigger near its column's left edge a
               `right-0` toast crosses exactly the edge `alignLeft` exists
               to keep the menu inside. */
            className={`absolute z-30 whitespace-nowrap rounded-2xl bg-danger px-3 py-1.5 text-xs text-white ${
              openUp ? "bottom-full mb-1" : "top-full mt-1"
            } ${alignLeft ? "left-0" : "right-0"}`}
          >
            {error}
          </div>
        )}
      </div>

      {renameOpen && dialogHost &&
        createPortal(
          <RenameDialog
            open={renameOpen}
            currentName={file.filename}
            onRename={handleRename}
            onCancel={() => setRenameOpen(false)}
          />,
          dialogHost
        )}

      {moveOpen && dialogHost &&
        createPortal(
          <MoveDialog
            open={moveOpen}
            drive={file.drive}
            currentPath={file.folder_path}
            onMove={handleMove}
            onCancel={() => setMoveOpen(false)}
          />,
          dialogHost
        )}

      {/* Through the same portal as the others. Opened from inside the
          mobile Bottom Sheet, a dialog rendered in place is buried by
          the sheet it was opened from. */}
      {collectionPickerOpen && dialogHost &&
        createPortal(
          <CollectionPicker
            open={collectionPickerOpen}
            drive={file.drive}
            fileIds={[file.id]}
            onClose={() => setCollectionPickerOpen(false)}
          />,
          dialogHost
        )}

      {deleteOpen && dialogHost &&
        createPortal(
          <ConfirmDialog
            open={deleteOpen}
            title={tt("moveToTrash")}
            message={tt("confirmMoveToTrash", { name: file.filename })}
            confirmLabel={tt("moveToTrash")}
            onConfirm={handleDelete}
            onCancel={() => setDeleteOpen(false)}
            note={tt("autoDelete")}
          />,
          dialogHost
        )}
    </>
  );
}
