"use client";

import type { KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Folder as FolderIcon,
  SquarePen,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { FolderPicker } from "../FolderPicker";

export interface QuickNotePresenterProps {
  open: boolean;
  onOpen: () => void;
  /** Header action, so focus can be returned to it when the panel closes. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Panel element the container's focus trap walks. */
  dialogRef: RefObject<HTMLDivElement | null>;
  onDialogKeyDown: (event: KeyboardEvent<HTMLElement>) => void;

  body: string;
  onBodyChange: (value: string) => void;
  /** Filename the current body would produce, shown read-only. */
  filename: string;
  bodyRef: RefObject<HTMLTextAreaElement | null>;

  drives: string[];
  drive: string | null;
  onDriveChange: (drive: string) => void;
  folder: string;
  onFolderChange: (folder: string) => void;
  destinationOpen: boolean;
  onToggleDestination: () => void;
  drivesLoading: boolean;
  drivesFailed: boolean;
  onReloadDrives: () => void;

  canSave: boolean;
  submitting: boolean;
  error: string | null;
  onSave: () => void;
  onRequestClose: () => void;

  discardOpen: boolean;
  discardRef: RefObject<HTMLButtonElement | null>;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}

/**
 * Header trigger plus the Quick Note panel. Pure rendering: every piece of
 * state, every request, and every focus move belongs to the container.
 *
 * The panel is portalled to `document.body` because the trigger lives inside
 * the sticky header (`z-20`); rendered in place, the panel would be trapped
 * under the header's stacking context and covered by the toolbar.
 */
export function QuickNotePresenter({
  open,
  onOpen,
  triggerRef,
  dialogRef,
  onDialogKeyDown,
  body,
  onBodyChange,
  filename,
  bodyRef,
  drives,
  drive,
  onDriveChange,
  folder,
  onFolderChange,
  destinationOpen,
  onToggleDestination,
  drivesLoading,
  drivesFailed,
  onReloadDrives,
  canSave,
  submitting,
  error,
  onSave,
  onRequestClose,
  discardOpen,
  discardRef,
  onConfirmDiscard,
  onCancelDiscard,
}: QuickNotePresenterProps) {
  const t = useTranslations("quickNote");
  const tc = useTranslations("common");

  const destinationLabel = drive
    ? `${drive} / ${folder || t("driveRoot")}`
    : t("selectDrive");

  const panel = (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onRequestClose}
        aria-hidden
      />

      <div
        ref={dialogRef}
        onKeyDown={onDialogKeyDown}
        role="dialog"
        aria-modal
        aria-label={t("title")}
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-bg-border bg-bg-card shadow-lg animate-fade-in-scale"
      >
        {/* While the discard confirmation is up, the panel behind it is inert:
            it must be answered, not tabbed around. */}
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" inert={discardOpen}>
          <h2 className="text-sm font-semibold text-text-primary">{t("title")}</h2>
          <button
            type="button"
            onClick={onRequestClose}
            className="rounded-xl p-1 text-text-muted transition-colors hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrolls on short viewports (software keyboard) so the
            destination controls never push the textarea out of reach. */}
        <div
          className="flex-1 space-y-3 overflow-y-auto px-5 pb-4"
          inert={discardOpen}
        >
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("bodyLabel")}
            rows={8}
            className="min-h-[9rem] w-full resize-none rounded-2xl border border-bg-border bg-bg-primary px-4 py-3 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none"
          />

          <p className="truncate text-xs text-text-muted" title={filename}>
            {t("filenamePreview")}:{" "}
            <span className="font-medium text-text-primary">{filename}</span>
          </p>

          <div>
            <button
              type="button"
              onClick={onToggleDestination}
              aria-expanded={destinationOpen}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-bg-border bg-bg-primary px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-focus-ring"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FolderIcon size={14} className="shrink-0 text-text-muted" />
                <span className="text-text-muted">{t("destination")}:</span>
                <span className="truncate font-medium">{destinationLabel}</span>
              </span>
              {destinationOpen ? (
                <ChevronUp size={14} className="ml-2 shrink-0 text-text-muted" />
              ) : (
                <ChevronDown size={14} className="ml-2 shrink-0 text-text-muted" />
              )}
            </button>

            {destinationOpen && (
              <div className="mt-2 space-y-2">
                {drivesLoading && (
                  <p className="text-sm text-text-muted">{tc("loading")}</p>
                )}

                {!drivesLoading && drivesFailed && (
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-danger/10 px-3 py-2">
                    <span className="text-sm text-danger">{t("drivesFailed")}</span>
                    <button
                      type="button"
                      onClick={onReloadDrives}
                      className="rounded-2xl bg-sand px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-sand-hover"
                    >
                      {t("retry")}
                    </button>
                  </div>
                )}

                {!drivesLoading && !drivesFailed && drives.length === 0 && (
                  <p className="text-sm text-text-muted">{t("noDrives")}</p>
                )}

                {drives.length > 0 && (
                  <select
                    value={drive ?? ""}
                    onChange={(e) => onDriveChange(e.target.value)}
                    aria-label={t("driveLabel")}
                    className="w-full rounded-2xl border border-bg-border bg-bg-primary px-4 py-2.5 text-sm text-text-primary focus:border-focus-ring focus:outline-none"
                  >
                    {!drive && (
                      <option value="" disabled>
                        {t("selectDrive")}
                      </option>
                    )}
                    {drives.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}

                {drive && (
                  // Keyed by drive: FolderPicker seeds its browse path and its
                  // all-folders cache once, so reusing the instance across a
                  // drive change would leave another drive's breadcrumb and
                  // search results selectable here.
                  <FolderPicker
                    key={drive}
                    drive={drive}
                    value={folder}
                    onChange={onFolderChange}
                  />
                )}
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-2 border-t border-bg-border px-5 py-3"
          inert={discardOpen}
        >
          <button
            type="button"
            onClick={onRequestClose}
            className="rounded-2xl bg-sand px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-sand-hover"
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:bg-sand disabled:text-warm-silver disabled:cursor-not-allowed"
          >
            {submitting ? t("saving") : tc("save")}
          </button>
        </div>

        {/* Discard confirmation. Rendered inside the panel rather than as a
            second dialog so it cannot land underneath it. */}
        {discardOpen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-card/95 p-6">
            <div className="w-full max-w-xs text-center">
              <h3 className="text-sm font-semibold text-text-primary">
                {t("discardTitle")}
              </h3>
              <p className="mt-2 text-sm text-text-muted">{t("discardMessage")}</p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={onCancelDiscard}
                  className="rounded-2xl bg-sand px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-sand-hover"
                >
                  {t("keepEditing")}
                </button>
                <button
                  ref={discardRef}
                  type="button"
                  onClick={onConfirmDiscard}
                  className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  {t("discard")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onOpen}
        className="rounded-2xl p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        aria-label={t("open")}
        title={t("open")}
      >
        <SquarePen size={18} />
      </button>

      {open && typeof document !== "undefined" && createPortal(panel, document.body)}
    </>
  );
}
