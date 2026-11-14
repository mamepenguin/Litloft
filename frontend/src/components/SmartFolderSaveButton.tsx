"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { House, HousePlus, Pencil, Save, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import { setHomeShortcut } from "@/lib/api";
import { useSmartFolders } from "@/hooks/useSmartFolders";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { SmartFolderSaveDialog } from "./SmartFolderSaveDialog";
import { ActionMenuItem } from "./ActionMenuItem";
import { MenuSeparator } from "./ToolbarMenu";
import { useToast } from "./ToastProvider";

interface SmartFolderSaveProps {
  drive: string;
  query: string;
  /**
   * Smart folders accept only four kinds
   * (`_SMART_FOLDER_FILE_TYPES`: video / image / audio / document), so
   * saving one narrowed to any other kind fails with the existing
   * "could not save" error.
   */
  typeFilter?: FileKind | null;
  smartFolderId: string | null;
  show?: string | null;
  includeSceneClip?: boolean;
  /** Moves focus to the results bar's `…` after an overwrite. */
  focusMoreTrigger?: () => void;
}

interface SmartFolderActions {
  current: SmartFolder | null;
  /** The URL's conditions differ from the folder's saved ones. */
  changed: boolean;
  saving: boolean;
  save: () => void;
  overwrite: (options?: { moveFocus?: boolean }) => Promise<void>;
  rename: () => void;
  remove: () => void;
  toggleHome: () => void;
}

const SmartFolderActionsContext = createContext<SmartFolderActions | null>(null);

/**
 * Owns the Smart Folder dialogs and the error toast. It lives for as long as
 * the page does: the menu that offers the entries unmounts when it closes,
 * while the dialog it opened has to keep working.
 */
export function SmartFolderController({
  drive,
  query,
  typeFilter,
  smartFolderId,
  show,
  includeSceneClip,
  focusMoreTrigger,
  children,
}: SmartFolderSaveProps & { children?: ReactNode }) {
  const t = useTranslations("smartFolder");
  const tDrive = useTranslations("drive");
  const router = useRouter();
  const toast = useToast();
  const homeInFlight = useRef(false);

  const { smartFolders, create, update, remove, setOnHome } = useSmartFolders(drive);

  const current = useMemo(
    () =>
      smartFolderId
        ? smartFolders.find((sf) => sf.id === smartFolderId) ?? null
        : null,
    [smartFolders, smartFolderId],
  );

  const changed =
    current !== null &&
    (query.trim() !== current.query ||
      (typeFilter ?? null) !== current.file_type);

  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Guarded from the press, not from the render that disables the button: a
  // second press in the same tick would otherwise send a second PATCH.
  const savingRef = useRef(false);
  const focusMoreAfterOverwrite = useRef(false);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  // After the render that drops the button, so focus does not fall to `<body>`
  // when the focused button unmounts.
  useEffect(() => {
    if (saving || !focusMoreAfterOverwrite.current) return;
    focusMoreAfterOverwrite.current = false;
    focusMoreTrigger?.();
  }, [saving, focusMoreTrigger]);

  const buildSearchUrl = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams();
      params.set("q", query);
      if (typeFilter) params.set("type", typeFilter);
      if (id) params.set("smart_folder_id", id);
      if (includeSceneClip) params.set("include_scene_clip", "true");
      if (show === "passages") params.set("show", "passages");
      return `/drive/${encodeURIComponent(drive)}/search?${params.toString()}`;
    },
    [drive, query, typeFilter, includeSceneClip, show],
  );

  const handleSaveSubmit = useCallback(
    async (name: string) => {
      try {
        const created = await create({
          name,
          query,
          file_type: typeFilter ?? null,
        });
        setSaveOpen(false);
        router.replace(buildSearchUrl(created.id));
      } catch {
        setError(t("saveFailed"));
      }
    },
    [create, query, typeFilter, router, buildSearchUrl, t],
  );

  const handleRenameSubmit = useCallback(
    async (name: string) => {
      if (!current) return;
      try {
        await update(current.id, { name });
        setRenameOpen(false);
      } catch {
        setError(t("renameFailed"));
      }
    },
    [current, update, t],
  );

  const overwrite = useCallback(
    async (options?: { moveFocus?: boolean }) => {
      if (!current || savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await update(current.id, {
          query: query.trim(),
          file_type: typeFilter ?? null,
        });
        if (options?.moveFocus) focusMoreAfterOverwrite.current = true;
      } catch {
        setError(t("updateFailed"));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [current, query, typeFilter, update, t],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!current) return;
    try {
      await remove(current.id);
      setDeleteConfirmOpen(false);
      router.replace(buildSearchUrl(null));
    } catch {
      setError(t("deleteFailed"));
    }
  }, [current, remove, router, buildSearchUrl, t]);

  const handleToggleHome = useCallback(async () => {
    if (!current || homeInFlight.current) return;
    homeInFlight.current = true;
    const next = !current.on_home;
    try {
      await setHomeShortcut(drive, {
        kind: "smart_folder",
        id: current.id,
        on_home: next,
      });
      setOnHome(current.id, next);
    } catch {
      toast.error(tDrive("homeShortcutFailed"));
    } finally {
      homeInFlight.current = false;
    }
  }, [current, drive, setOnHome, toast, tDrive]);

  const actions = useMemo<SmartFolderActions>(
    () => ({
      current,
      changed,
      saving,
      overwrite,
      save: () => setSaveOpen(true),
      rename: () => setRenameOpen(true),
      remove: () => setDeleteConfirmOpen(true),
      toggleHome: () => void handleToggleHome(),
    }),
    [current, changed, saving, overwrite, handleToggleHome],
  );

  return (
    <SmartFolderActionsContext.Provider value={query.trim() ? actions : null}>
      {children}
      <SmartFolderSaveDialog
        open={saveOpen}
        mode="save"
        description={t("saveDescription")}
        onSubmit={handleSaveSubmit}
        onCancel={() => setSaveOpen(false)}
      />
      <SmartFolderSaveDialog
        open={renameOpen}
        mode="rename"
        initialName={current?.name ?? ""}
        onSubmit={handleRenameSubmit}
        onCancel={() => setRenameOpen(false)}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("deleteConfirmTitle")}
        message={t("deleteConfirmMessage", { name: current?.name ?? "" })}
        confirmLabel={t("delete")}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl bg-danger px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </SmartFolderActionsContext.Provider>
  );
}

/**
 * The overwrite action of an open Smart Folder, for the row under the query
 * field. Draws nothing without a controller above it, a resolved folder, or a
 * difference to save.
 */
export function SmartFolderOverwriteButton() {
  const t = useTranslations("smartFolder");
  const actions = useContext(SmartFolderActionsContext);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!actions || !actions.current || !actions.changed) return null;

  return (
    <Button
      ref={buttonRef}
      variant="secondary"
      size="sm"
      className="ml-auto"
      disabled={actions.saving}
      aria-label={t("overwriteLabel", { name: actions.current.name })}
      onClick={() => {
        void actions.overwrite({
          moveFocus: document.activeElement === buttonRef.current,
        });
      }}
    >
      <Save size={16} />
      {t("update")}
    </Button>
  );
}

interface SmartFolderMenuItemsProps {
  closeMenu: () => void;
  /** Whether a row comes after these and wants a rule before it. */
  separated?: boolean;
}

/** The Smart Folder rows of the `…` menu, in the order it offers them. */
export function SmartFolderMenuItems({
  closeMenu,
  separated = false,
}: SmartFolderMenuItemsProps) {
  const t = useTranslations("smartFolder");
  const tDrive = useTranslations("drive");
  const actions = useContext(SmartFolderActionsContext);

  if (!actions) return null;

  const choose = (act: () => void) => {
    closeMenu();
    act();
  };

  if (actions.current) {
    return (
      <>
        {/* `w-0 min-w-full`: the menu sizes to its action rows, so a long
            name truncates instead of widening the panel. */}
        <div role="presentation" className="w-0 min-w-full px-3 py-2">
          <span className="block truncate text-sm text-text-muted">
            {t("saved", { name: actions.current.name })}
          </span>
        </div>
        <ActionMenuItem
          icon={Save}
          label={t("update")}
          disabled={!actions.changed || actions.saving}
          onClick={() =>
            choose(() => {
              void actions.overwrite();
            })
          }
        />
        <ActionMenuItem
          icon={Pencil}
          label={t("rename")}
          onClick={() => choose(actions.rename)}
        />
        <ActionMenuItem
          icon={actions.current.on_home ? House : HousePlus}
          label={
            actions.current.on_home
              ? tDrive("removeFromHome")
              : tDrive("putOnHome")
          }
          onClick={() => choose(actions.toggleHome)}
        />
        <ActionMenuItem
          icon={Trash2}
          label={t("delete")}
          danger
          onClick={() => choose(actions.remove)}
        />
        {separated && <MenuSeparator />}
      </>
    );
  }

  return (
    <>
      <ActionMenuItem
        icon={Star}
        label={t("save")}
        onClick={() => choose(actions.save)}
      />
      {separated && <MenuSeparator />}
    </>
  );
}
