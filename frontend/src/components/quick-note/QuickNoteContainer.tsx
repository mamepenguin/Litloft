"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";

import { createTextFile, getDrives } from "@/lib/api";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";
import { useCurrentDrive } from "../CurrentDriveProvider";
import { useToast } from "../ToastProvider";
import { QuickNotePresenter } from "./QuickNotePresenter";
import { deriveQuickNoteFilename } from "./quickNoteFilename";
import {
  QUICK_NOTE_DEFAULT_FOLDER,
  readQuickNoteFolder,
  readQuickNoteLastDrive,
  resolveQuickNoteDrive,
  writeQuickNoteFolder,
  writeQuickNoteLastDrive,
} from "./quickNoteDestination";

/** Mirrors the backend's `_TEXT_CREATE_MAX_BYTES` (1 MiB of UTF-8). */
const MAX_BODY_BYTES = 1 * 1024 * 1024;

interface Destination {
  drive: string | null;
  folder: string;
}

/** Pair a drive with the folder it remembers, so the two never disagree. */
function destinationFor(drive: string | null): Destination {
  return {
    drive,
    folder: drive ? readQuickNoteFolder(drive) : QUICK_NOTE_DEFAULT_FOLDER,
  };
}

/** Everything the focus trap considers reachable inside the dialog. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Pull the HTTP status out of the `API error: <status> …` message shape. */
function statusOf(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/API error: (\d{3})/);
  return match ? Number(match[1]) : null;
}

/**
 * Quick Note: capture a thought from any screen without leaving it.
 *
 * The body lives only here, in React memory. It is deliberately never mirrored
 * to localStorage, sessionStorage, a temp file, or the server — a reload loses
 * it by design, and Drafts remains the tool for uncommitted capture. Only the
 * destination (drive + folder) is remembered, and only after a save succeeds.
 *
 * Spec `docs/superpowers/specs/2026-08-13-global-quick-note.md`.
 */
export function QuickNoteContainer() {
  const t = useTranslations("quickNote");
  const tc = useTranslations("common");
  const tsc = useTranslations("shortcuts");
  const toast = useToast();
  const currentDrive = useCurrentDrive();

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [drives, setDrives] = useState<string[]>([]);
  const [drivesLoading, setDrivesLoading] = useState(false);
  const [drivesFailed, setDrivesFailed] = useState(false);
  // Drive and folder are one value, not two pieces of state. FolderPicker
  // seeds its browse path from `value` on mount, and the panel remounts it on
  // every drive change (`key={drive}`), so a drive that lands one render
  // before its folder would hand the new picker the previous drive's path.
  const [destination, setDestination] = useState<Destination>({
    drive: null,
    folder: QUICK_NOTE_DEFAULT_FOLDER,
  });
  const { drive, folder } = destination;
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const discardRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Latched separately from `submitting` so two synchronous invocations
  // (double click, or click plus Cmd+Enter) cannot both open a request.
  const inFlightRef = useRef(false);

  // This component is mounted in the header, so it outlives every navigation.
  // The loader must therefore read the drive of the screen the panel is being
  // opened from, not the one captured when the callback was created.
  const currentDriveRef = useRef(currentDrive);
  useEffect(() => {
    currentDriveRef.current = currentDrive;
  }, [currentDrive]);

  /**
   * Load the drives this viewer can currently write to.
   *
   * The response is authoritative. `reresolve` distinguishes the two callers:
   *
   * - opening the panel re-runs the whole resolution order, so moving from
   *   drive A to drive B and opening again targets B rather than silently
   *   keeping A (which would file the note in the wrong security boundary);
   * - a retry or a post-403 refresh keeps the selection the user made in this
   *   session, as long as it is still in the response.
   */
  const loadDrives = useCallback(async (options?: { reresolve?: boolean }) => {
    const reresolve = options?.reresolve === true;
    setDrivesLoading(true);
    setDrivesFailed(false);
    try {
      const names = (await getDrives()).map((d) => d.name);
      setDrives(names);
      setDestination((previous) => {
        if (!reresolve && previous.drive && names.includes(previous.drive)) {
          return previous;
        }
        // A fresh open also re-reads the folder preference, so a folder that
        // was picked but never saved successfully does not carry over.
        return destinationFor(
          resolveQuickNoteDrive({
            currentDrive: currentDriveRef.current,
            lastDrive: readQuickNoteLastDrive(),
            accessibleDrives: names,
          }),
        );
      });
    } catch {
      // The list could not be confirmed. Keep whatever is selected on screen
      // but treat the destination as unverified — `canSave` refuses to write
      // to a drive this session has not seen in an accessible-drive response.
      setDrives([]);
      setDrivesFailed(true);
    } finally {
      setDrivesLoading(false);
    }
  }, []);

  const openPanel = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) return true;
      setError(null);
      setDiscardOpen(false);
      setDestinationOpen(false);
      return true;
    });
  }, []);

  // Drives are re-fetched and re-resolved on every open rather than cached:
  // access can change between two notes, the user may have navigated to a
  // different drive, and this is a single cheap request.
  useEffect(() => {
    if (!open) return;
    void loadDrives({ reresolve: true });
  }, [open, loadDrives]);

  // Opening always focuses the textarea — the feature is worth nothing if the
  // user has to click before typing.
  useEffect(() => {
    if (!open) return;
    bodyRef.current?.focus();
  }, [open]);

  // The destination section opens itself whenever the user has to act on it:
  // no drive could be resolved (they must choose one), or the list could not
  // be loaded (they need to see the failure and the retry, not just a Save
  // button that silently refuses).
  useEffect(() => {
    if (!open || drivesLoading) return;
    if (drivesFailed || (drive === null && drives.length > 0)) {
      setDestinationOpen(true);
    }
  }, [open, drivesLoading, drivesFailed, drive, drives.length]);

  // Switching drives moves to that drive's own remembered folder in the same
  // update, never leaving the other drive's path selected in between.
  const handleDriveChange = useCallback((next: string) => {
    setDestination(destinationFor(next));
  }, []);

  const handleFolderChange = useCallback((next: string) => {
    setDestination((previous) => ({ ...previous, folder: next }));
  }, []);

  useEffect(() => {
    if (discardOpen) discardRef.current?.focus();
  }, [discardOpen]);

  // Return focus to the header action when the panel goes away, so keyboard
  // users land back where they started instead of at the top of the document.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const filename = useMemo(() => deriveQuickNoteFilename(body), [body]);
  const overLimit = useMemo(() => byteLength(body) > MAX_BODY_BYTES, [body]);

  /**
   * The destination is only usable when the currently selected drive appears
   * in an accessible-drive response this session actually received. While the
   * list is loading or failed, nothing is confirmed and Save stays closed.
   */
  const destinationReady =
    drive !== null && !drivesLoading && !drivesFailed && drives.includes(drive);

  const closeAndClear = useCallback(() => {
    setOpen(false);
    setBody("");
    setError(null);
    setDiscardOpen(false);
    setDestinationOpen(false);
  }, []);

  const requestClose = useCallback(() => {
    if (inFlightRef.current) return;
    if (body.trim().length > 0) {
      setDiscardOpen(true);
      return;
    }
    closeAndClear();
  }, [body, closeAndClear]);

  const cancelDiscard = useCallback(() => {
    setDiscardOpen(false);
    bodyRef.current?.focus();
  }, []);

  const handleSave = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!drive || !destinationReady || body.trim().length === 0) return;
    if (overLimit) {
      setError(t("tooLarge"));
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const path = folder ? `${folder}/${filename}` : filename;
      // Default conflict_mode="rename": the backend appends " (1)", " (2)"…,
      // so the returned path — not the predicted one — names the file.
      const file = await createTextFile(drive, { path, content: body });

      writeQuickNoteFolder(drive, folder);
      writeQuickNoteLastDrive(drive);

      const savedPath = file.folder_path
        ? `${file.folder_path}/${file.filename}`
        : file.filename;
      toast.success(t("saved", { path: `${drive}/${savedPath}` }));
      closeAndClear();
    } catch (err) {
      const status = statusOf(err);
      if (status === 413) setError(t("tooLarge"));
      else if (status === 403 || status === 404) setError(t("forbidden"));
      else if (status === 400 || status === 409) setError(t("invalidPath"));
      else setError(t("saveFailed"));

      // Access may have changed under us; re-resolve so the panel cannot keep
      // pointing at a drive the viewer no longer reaches.
      if (status === 403 || status === 404) {
        setDestinationOpen(true);
        void loadDrives();
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }, [
    drive,
    destinationReady,
    body,
    overLimit,
    folder,
    filename,
    toast,
    t,
    closeAndClear,
    loadDrives,
  ]);

  /**
   * Keep Tab inside the open dialog, and inside the discard confirmation while
   * that is up — otherwise the confirmation can be walked around with the
   * keyboard and the note discarded (or saved) without answering it.
   */
  const handleDialogKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;

    // `inert` subtrees are skipped: the panel marks its own content inert while
    // the discard confirmation is showing.
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => el.closest("[inert]") === null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && focusable.includes(active);

    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  // `N` alone, with `editingOnly` unset, so it fires only when focus is not in
  // a field. That is what keeps the global command out of the Knowledge
  // editor, search, and comment boxes; the header button still works there.
  useShortcuts("quick-note", tsc("quickNote"), [
    { key: "n", label: tsc("quickNote"), handler: openPanel },
  ]);

  // The open panel owns Escape and Cmd/Ctrl+Enter outright. `editingOnly:
  // false` is required because the textarea has focus, and OVERLAY_PRIORITY
  // keeps a context that enables later (an addon editor finishing its load)
  // from taking the chords back.
  useShortcuts(
    "quick-note-modal",
    tsc("quickNote"),
    [
      {
        key: "escape",
        label: tc("close"),
        editingOnly: false,
        hidden: true,
        handler: () => (discardOpen ? cancelDiscard() : requestClose()),
      },
      {
        key: "ctrl+enter",
        label: tc("save"),
        editingOnly: false,
        handler: () => {
          if (!discardOpen) void handleSave();
        },
      },
    ],
    open,
    OVERLAY_PRIORITY,
  );

  const canSave =
    !submitting && !overLimit && body.trim().length > 0 && destinationReady;

  return (
    <QuickNotePresenter
      open={open}
      onOpen={openPanel}
      triggerRef={triggerRef}
      dialogRef={dialogRef}
      onDialogKeyDown={handleDialogKeyDown}
      body={body}
      onBodyChange={setBody}
      filename={filename}
      bodyRef={bodyRef}
      drives={drives}
      drive={drive}
      onDriveChange={handleDriveChange}
      folder={folder}
      onFolderChange={handleFolderChange}
      destinationOpen={destinationOpen}
      onToggleDestination={() => setDestinationOpen((v) => !v)}
      drivesLoading={drivesLoading}
      drivesFailed={drivesFailed}
      onReloadDrives={() => void loadDrives()}
      canSave={canSave}
      submitting={submitting}
      error={error ?? (overLimit ? t("tooLarge") : null)}
      onSave={() => void handleSave()}
      onRequestClose={requestClose}
      discardOpen={discardOpen}
      discardRef={discardRef}
      onConfirmDiscard={closeAndClear}
      onCancelDiscard={cancelDiscard}
    />
  );
}
