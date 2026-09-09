"use client";

import { useCallback, useRef, useState } from "react";

import { dispatchUploadEvent, useFilePicker } from "./useFilePicker";
import {
  ChevronDown,
  File as FileIcon,
  FilePlus,
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
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import type { UploadFileEntry } from "@/hooks/useUpload";

/**
 * The slot for addon rows inside this menu.
 *
 * A second id rather than a second contract on the slot it replaced: that
 * one drew a standalone button in the toolbar, and an entry written for it
 * renders a button. Rendering the same entry inside a `role="menu"` gives a
 * button in a dropdown whose own dropdown opens over its parent, so
 * redefining the old id would have broken every addon on it for as long as
 * each repository took to catch up. Addons moved by declaring this id
 * instead, and the old slot is gone.
 *
 * The contract is `file-actions-menu`'s, unchanged: entries draw
 * `ActionMenuItem` rows and are indistinguishable from the host's own.
 */
export const ADD_MENU_SLOT = "folder-actions-menu";

interface AddButtonProps {
  onCreateFolder?: () => void;
  /**
   * When provided, a "New note" row. The same gate the standalone button
   * carried: a caller with no concrete folder to write into omits it.
   */
  onCreateFile?: () => void;
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
 * This is the folder toolbar's single accent fill (DESIGN.md §2.2). It was
 * three buttons — upload, new folder, new note — plus an addon's own, each
 * competing for the same corner, two of them accent-filled.
 */
export function AddButton({
  onCreateFolder,
  onCreateFile,
  addonProps,
  align = "left",
}: AddButtonProps = {}) {
  const tu = useTranslations("upload");
  const tf = useTranslations("folder");
  const t = useTranslations("toolbar");
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  // A popup must be dismissable from the keyboard. Without it the only
  // ways out are a press outside it or picking a row, so a keyboard user
  // who opens this menu cannot back out of it.
  //
  // On the shortcut stack, not on `document`: a listener does not know
  // what is stacked above it, and `escape-listeners.test.ts` records the
  // presses that were answered twice before this was the rule.
  // `OVERLAY_PRIORITY` is what puts this menu ahead of the page beneath
  // while it is open. `FileActions` carries the same block and the
  // reasoning in full.
  //
  // `editingOnly: false` because nothing traps focus inside this menu, so
  // Tab walks out of the last row into whatever follows in the document.
  // The provider counts a focused field as "editing", and the default
  // fires only when nothing is — which would leave Escape inert exactly
  // there, with the menu still up. The test case for that state is what
  // makes the flag checkable.
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
    menuOpen,
    OVERLAY_PRIORITY,
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
      <div className="relative">
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
            className="fixed inset-0 z-30"
          >
            <div
              role="menu"
              // Capped and scrollable, like every other menu on this bar.
              // `MENU_SURFACE` is anchored to the *right* of its trigger;
              // this keeps its own geometry and takes only the height rules,
              // because which side it grows from depends on the caller: on
              // the folder toolbar `Add` is the leftmost control, and in the
              // drive root's `PageHeader` it is the rightmost, where a
              // left-anchored 180px panel behind a ~100px trigger runs off
              // the right edge of a phone.
              //
              // It grows with `folder-actions-menu`: three contributed rows
              // take it from four to seven and from ~120px to 331. Measured
              // uncapped, seven rows, bar pinned: 383 against a 375 fold at
              // 667x375, and against 360 at 740x360 and 640x360. Capped, all
              // of those fit and scroll.
              //
              // `max-h` is against the viewport, not against the room below
              // the trigger — so before the bar pins, with `Header` and the
              // breadcrumb above it, even the capped menu can end below the
              // fold (441 of 393 at 852x393). Scrolling recovers that; what
              // it cannot recover is a menu with no cap at all, which stays
              // 331 tall however far the bar rises.
              className={`absolute top-full z-30 mt-1 max-h-[60vh] min-w-[180px] overflow-y-auto rounded-xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:max-h-[70vh] ${
                align === "right"
                  ? "right-0 origin-top-right"
                  : "left-0 origin-top-left"
              }`}
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
              {onCreateFile && (
                <ActionMenuItem
                  icon={FilePlus}
                  label={tf("newFile")}
                  onClick={() => {
                    closeMenu();
                    onCreateFile();
                  }}
                />
              )}
              {showAddonRows && (
                /* The rule is this element's own border, not a sibling, so
                   `empty:hidden` can take both away together. `hasSlot` only
                   answers "did an addon declare this slot" — an entry that
                   did may still render nothing here (a drive with the
                   addon's feature policy off does exactly that), and the
                   rule would then hang under the last core row with nothing
                   beneath it. Ported from `FileActions`, which carries this
                   for the same reason.

                   `role="none"`: the rows inside must read as direct
                   children of `role="menu"`, and the rule is decoration. */
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
                    }}
                  />
                </div>
              )}
            </div>
          </DismissScrim>
        )}
      </div>
    </>
  );
}
