"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Pencil, RefreshCw, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";
import { useSmartFolders } from "@/hooks/useSmartFolders";
import { ConfirmDialog } from "./ConfirmDialog";
import { SmartFolderSaveDialog } from "./SmartFolderSaveDialog";
import { ActionMenuItem } from "./ActionMenuItem";
import { MenuSeparator } from "./ToolbarMenu";

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
}

interface SmartFolderActions {
  current: SmartFolder | null;
  save: () => void;
  update: () => void;
  rename: () => void;
  remove: () => void;
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
  children,
}: SmartFolderSaveProps & { children?: ReactNode }) {
  const t = useTranslations("smartFolder");
  const router = useRouter();

  const { smartFolders, create, update, remove } = useSmartFolders(drive);

  const current = useMemo(
    () =>
      smartFolderId
        ? smartFolders.find((sf) => sf.id === smartFolderId) ?? null
        : null,
    [smartFolders, smartFolderId],
  );

  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

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

  const handleUpdateConfirm = useCallback(async () => {
    if (!current) return;
    try {
      await update(current.id, {
        query,
        file_type: typeFilter ?? null,
      });
      setUpdateConfirmOpen(false);
    } catch {
      setError(t("updateFailed"));
    }
  }, [current, update, query, typeFilter, t]);

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

  const actions = useMemo<SmartFolderActions>(
    () => ({
      current,
      save: () => setSaveOpen(true),
      update: () => setUpdateConfirmOpen(true),
      rename: () => setRenameOpen(true),
      remove: () => setDeleteConfirmOpen(true),
    }),
    [current],
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
        open={updateConfirmOpen}
        title={t("updateConfirmTitle")}
        message={t("updateConfirmMessage", { name: current?.name ?? "" })}
        confirmLabel={t("update")}
        onConfirm={handleUpdateConfirm}
        onCancel={() => setUpdateConfirmOpen(false)}
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
  const actions = useContext(SmartFolderActionsContext);

  if (!actions) return null;

  const choose = (act: () => void) => {
    closeMenu();
    act();
  };

  if (actions.current) {
    return (
      <>
        <div role="presentation" className="px-3 py-2">
          <span className="block truncate text-sm text-text-muted">
            {t("saved", { name: actions.current.name })}
          </span>
        </div>
        <ActionMenuItem
          icon={RefreshCw}
          label={t("update")}
          onClick={() => choose(actions.update)}
        />
        <ActionMenuItem
          icon={Pencil}
          label={t("rename")}
          onClick={() => choose(actions.rename)}
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
