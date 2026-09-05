"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { UploadFileEntry } from "@/hooks/useUpload";

/**
 * The slot for addon rows inside this menu.
 *
 * A second id rather than a second contract on `folder-actions`: that one
 * is drawn as a standalone button in the toolbar, and an entry written for
 * it renders a button. Rendering the same entry inside a `role="menu"`
 * gives a button in a dropdown whose own dropdown opens over its parent —
 * so changing what `folder-actions` means would break every addon on it
 * for as long as it took each repository to catch up. An addon moves by
 * changing which id it declares, and the toolbar's standalone button
 * disappears on its own once the old slot is empty (`AddonSlot` renders
 * nothing for a slot with no entries).
 *
 * The contract is `file-actions-menu`'s, unchanged: entries draw
 * `ActionMenuItem` rows and are indistinguishable from the host's own.
 */
export const ADD_MENU_SLOT = "folder-actions-menu";

function dispatchUploadEvent(detail: File[] | UploadFileEntry[]) {
  const uploadZone = document.querySelector<HTMLElement>("[data-upload-zone]");
  if (uploadZone) {
    uploadZone.dispatchEvent(new CustomEvent("upload-files", { detail }));
  }
}

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
}: AddButtonProps = {}) {
  const tu = useTranslations("upload");
  const tf = useTranslations("folder");
  const t = useTranslations("toolbar");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            dispatchUploadEvent(Array.from(e.target.files));
          }
          e.target.value = "";
        }}
      />
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
      <div ref={menuRef} className="relative">
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
          <div
            role="menu"
            className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale origin-top-left"
          >
            <ActionMenuItem
              icon={FileIcon}
              label={tu("files")}
              onClick={() => {
                closeMenu();
                fileInputRef.current?.click();
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
        )}
      </div>
    </>
  );
}
