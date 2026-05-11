"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, File as FileIcon, Folder, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UploadFileEntry } from "@/hooks/useUpload";

function dispatchUploadEvent(detail: File[] | UploadFileEntry[]) {
  const uploadZone = document.querySelector<HTMLElement>("[data-upload-zone]");
  if (uploadZone) {
    uploadZone.dispatchEvent(new CustomEvent("upload-files", { detail }));
  }
}

export function UploadButton() {
  const tc = useTranslations("common");
  const tu = useTranslations("upload");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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
        <button
          onClick={() => setMenuOpen((s) => !s)}
          className="flex items-center gap-1.5 rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-white transition-all hover:bg-accent-hover"
          aria-label={tc("upload")}
        >
          <Upload size={16} />
          <span className="hidden sm:inline">{tc("upload")}</span>
          <ChevronDown size={14} className="opacity-70" />
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale origin-top-left">
            <button
              onClick={() => {
                setMenuOpen(false);
                fileInputRef.current?.click();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <FileIcon size={16} />
              {tu("files")}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                folderInputRef.current?.click();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <Folder size={16} />
              {tu("folder")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
