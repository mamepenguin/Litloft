"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dispatchUploadEvent, useFilePicker } from "./useFilePicker";
import {
  ChevronDown,
  File as FileIcon,
  Folder,
  FolderPlus,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ActionMenuItem } from "@/components/ActionMenuItem";
import { AddonSlot } from "@/components/AddonSlot";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { Button } from "@/components/Button";
import { DismissScrim } from "@/components/DismissScrim";
import {
  ANCHORED_ORIGIN,
  ANCHORED_VERTICAL,
  useAnchoredDirection,
} from "@/hooks/useAnchoredDirection";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import type { UploadFileEntry } from "@/hooks/useUpload";

/**
 * The slot for addon rows inside this menu. The contract is
 * `file-actions-menu`'s: entries draw `ActionMenuItem` rows.
 */
export const ADD_MENU_SLOT = "folder-actions-menu";

interface AddButtonProps {
  onCreateFolder?: () => void;
  /**
   * Context handed to `folder-actions-menu`, and the opt-in that renders
   * the slot at all — the shape `FileActions` uses for `file-actions-menu`.
   * A caller with no folder context gives no addon rows.
   */
  addonProps?: Record<string, unknown>;
  /**
   * Which edge of the trigger the menu grows from.
   *
   * `"left"` for a control at the left end of a bar (the folder
   * toolbar), `"right"` for one at the right end (the drive root's page
   * header) — the panel is wider than the trigger, so an anchor on the
   * wrong side leaves the far edge outside the viewport.
   */
  align?: "left" | "right";
}

/**
 * Everything that puts something into the current folder, behind one
 * control.
 *
 * This is the folder toolbar's single accent fill (DESIGN.md §2.2).
 */
export function AddButton({
  onCreateFolder,
  addonProps,
  align = "left",
}: AddButtonProps = {}) {
  const tu = useTranslations("upload");
  const tf = useTranslations("folder");
  const t = useTranslations("toolbar");
  const [menuOpen, setMenuOpen] = useState(false);
  const [addonDialogOpen, setAddonDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // `align` is the side this menu *prefers*; the hook hands it the other
  // one where the preferred edge has no room. The two callers disagree
  // about the preference — `Add` is the leftmost control on the folder
  // toolbar and the rightmost in the drive root's `PageHeader` — which is
  // why the preference is a prop and the answer is not.
  const { openUp, side } = useAnchoredDirection({
    triggerRef: wrapperRef,
    panelRef: menuRef,
    open: menuOpen,
    gapPx: ANCHORED_VERTICAL[1].px,
    preferSide: align,
  });
  const filePicker = useFilePicker();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { hasSlot } = useAddonSlots();
  const showAddonRows = addonProps !== undefined && hasSlot(ADD_MENU_SLOT);

  /**
   * The only way this menu closes.
   *
   * The row that was focused is about to unmount with the menu, and
   * without moving focus first it lands on `<body>` — a keyboard user is
   * returned to the top of the document having chosen something.
   * `FileActions` carries the same line for the same reason.
   */
  const closeMenu = useCallback(() => {
    setAddonDialogOpen(false);
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    // Set by an addon in another repository. Clearing it here means an entry
    // that forgets `onDialogOpenChange(false)` cannot leave the next menu
    // ignoring outside presses and Escape.
    if (!menuOpen) setAddonDialogOpen(false);
  }, [menuOpen]);

  // On the shortcut stack, not on `document`, so one press is answered
  // once. `editingOnly: false` because nothing traps focus here: Tab can
  // leave the menu for a field, and Escape must still close it.
  useShortcuts(
    "add-menu",
    "Dialog",
    [
      {
        key: "escape",
        label: "Close",
        editingOnly: false,
        hidden: true,
        handler: () => {
          closeMenu();
        },
      },
    ],
    menuOpen && !addonDialogOpen,
    OVERLAY_PRIORITY,
  );

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      // Not `useMenuSurface`: its classes are `sm:`-scoped because it is
      // a bottom sheet on phones, and this menu stays anchored at every
      // width. Capped because addon rows can push it past the fold.
      className={`absolute z-30 max-h-[60vh] min-w-[180px] overflow-y-auto rounded-xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:max-h-[70vh] ${
        ANCHORED_VERTICAL[1][openUp ? "up" : "down"]
      } ${
        side === "right"
          ? "right-0"
          : "left-0"
      } ${ANCHORED_ORIGIN[`${openUp ? "up" : "down"}-${side}`]}`}
    >
      <ActionMenuItem
        icon={FileIcon}
        label={tu("files")}
        onClick={() => {
          closeMenu();
          filePicker.open();
        }}
      />
      <ActionMenuItem
        icon={Folder}
        label={tu("folder")}
        onClick={() => {
          closeMenu();
          folderInputRef.current?.click();
        }}
      />
      {onCreateFolder && (
        <ActionMenuItem
          icon={FolderPlus}
          label={tf("newFolder")}
          onClick={() => {
            closeMenu();
            onCreateFolder();
          }}
        />
      )}
      {showAddonRows && (
        /* The divider is this element's own border so `empty:hidden`
           removes it when a declared addon renders nothing (policy off). */
        <div
          role="none"
          className="mt-1 border-t border-bg-border pt-1 empty:hidden"
        >
          <AddonSlot
            id={ADD_MENU_SLOT}
            layout="stack"
            props={{
              ...addonProps,
              onRequestClose: closeMenu,
              onDialogOpenChange: setAddonDialogOpen,
            }}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      {filePicker.input}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        {...{ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
        onChange={(e) => {
          if (e.target.files) {
            const entries: UploadFileEntry[] = Array.from(e.target.files).map((file) => ({
              file,
              relativePath: file.webkitRelativePath || "",
            }));
            dispatchUploadEvent(entries);
          }
          e.target.value = "";
        }}
      />
      <div ref={wrapperRef} className="relative">
        {/* The label is not `hidden sm:inline`. Dropping it at 400px would
            leave a `+` and a chevron, and the mobile rule is to carry fewer
            controls rather than nameless ones (00-basis, モバイルの寸法規則). */}
        <Button
          ref={triggerRef}
          variant="primary"
          onClick={() => setMenuOpen((s) => !s)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Plus size={16} />
          {t("add")}
          <ChevronDown size={14} className="opacity-70" />
        </Button>
        {menuOpen && (
          <DismissScrim
            onDismiss={() => setMenuOpen(false)}
            // No tint: this menu stays anchored to its trigger at every
            // width, so there is no sheet for a dim to explain.
            //
            // Disabled while a dialog raised from a row is up: the dialog
            // portals out of the menu, and the scrim counts any press
            // outside the menu as a dismissal.
            disabled={addonDialogOpen}
            className="fixed inset-0 z-30"
          >
            {menu}
          </DismissScrim>
        )}
      </div>
    </>
  );
}
