"use client";

import { useEffect, useRef, useState } from "react";
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
  const tc = useTranslations("common");
  const tu = useTranslations("upload");
  const tf = useTranslations("folder");
  const t = useTranslations("toolbar");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { hasSlot } = useAddonSlots();
  const showAddonRows = addonProps !== undefined && hasSlot(ADD_MENU_SLOT);

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
                setMenuOpen(false);
                fileInputRef.current?.click();
              }}
            />
            <ActionMenuItem
              icon={Folder}
              label={tu("folder")}
              onClick={() => {
                setMenuOpen(false);
                folderInputRef.current?.click();
              }}
            />
            {onCreateFolder && (
              <ActionMenuItem
                icon={FolderPlus}
                label={tf("newFolder")}
                onClick={() => {
                  setMenuOpen(false);
                  onCreateFolder();
                }}
              />
            )}
            {onCreateFile && (
              <ActionMenuItem
                icon={FilePlus}
                label={tf("newFile")}
                onClick={() => {
                  setMenuOpen(false);
                  onCreateFile();
                }}
              />
            )}
            {showAddonRows && (
              <>
                <div className="my-1 border-t border-bg-border" />
                <AddonSlot
                  id={ADD_MENU_SLOT}
                  layout="stack"
                  props={{
                    ...addonProps,
                    onRequestClose: () => setMenuOpen(false),
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
