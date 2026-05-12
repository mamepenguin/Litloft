"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  deleteCollection,
  getCollection,
  removeCollectionItem,
  reorderCollectionItems,
  updateCollection,
} from "@/lib/api";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CollectionItemsPane } from "@/components/CollectionItemsPane";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { TreeToggle } from "@/components/TreeToggle";
import { ViewToggle } from "@/components/ViewToggle";
import { useSetOverrideDrive } from "@/components/CurrentDriveProvider";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import { useToast } from "@/components/ToastProvider";
import { useCollectionViewMode } from "@/hooks/useCollectionViewMode";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { FileNavigationOverrideProvider } from "@/lib/fileNavigationOverride";
import type { CollectionDetail as CollectionDetailType } from "@/types";

interface CollectionDetailProps {
  drive: string;
  collectionId: string;
}

/**
 * Collection detail page (folder-like view).
 *
 * Spec ``docs/superpowers/specs/2026-05-12-playlist-to-collection.md`` §6.3
 * + PR-A / PR-B redo: a Collection behaves as a "virtual folder" rather
 * than a playback queue.
 *
 * Re-uses the existing ``<TwoPaneLayout>`` shell so the top-left
 * ``<TreeToggle>`` continues to control a single "show/hide left pane"
 * concept. The left pane content is swapped from ``FolderTreePane`` to
 * ``CollectionItemsPane`` — same shell, different sidebar — instead of
 * inventing a parallel two-pane primitive inside the main column.
 */
export function CollectionDetail({ drive, collectionId }: CollectionDetailProps) {
  const router = useRouter();
  const t = useTranslations("collection");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const setOverrideDrive = useSetOverrideDrive();
  const { selectFile } = useSelectedFile();

  const [detail, setDetail] = useState<CollectionDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { viewMode, setViewMode } = useCollectionViewMode({
    drive,
    collectionId,
    items: detail?.items ?? [],
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [deletingCollection, setDeletingCollection] = useState(false);

  useEffect(() => {
    setOverrideDrive(drive);
    return () => setOverrideDrive(null);
  }, [drive, setOverrideDrive]);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await getCollection(drive, collectionId);
      setDetail(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [drive, collectionId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveName = useCallback(async () => {
    if (!detail) return;
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === detail.name) return;
    try {
      await updateCollection(drive, collectionId, { name: next });
      setDetail({ ...detail, name: next });
    } catch {
      toast.error(t("errorRename"));
      load();
    }
  }, [detail, drive, collectionId, nameDraft, load, toast, t]);

  const handleSaveDescription = useCallback(async () => {
    if (!detail) return;
    const next = descriptionDraft.trim() || null;
    setEditingDescription(false);
    if (next === detail.description) return;
    try {
      await updateCollection(drive, collectionId, { description: next });
      setDetail({ ...detail, description: next });
    } catch {
      toast.error(t("errorDescription"));
      load();
    }
  }, [detail, drive, collectionId, descriptionDraft, load, toast, t]);

  const handleDelete = useCallback(async () => {
    if (!detail) return;
    try {
      await deleteCollection(drive, collectionId);
      router.push(`/drive/${encodeURIComponent(drive)}`);
    } catch {
      toast.error(t("errorDelete"));
      setDeletingCollection(false);
    }
  }, [detail, drive, collectionId, router, toast, t]);

  const handlePlay = useCallback(() => {
    if (!detail) return;
    const firstMedia = detail.items.find(
      (item) =>
        item.file.file_type === "video" || item.file.file_type === "audio",
    );
    if (!firstMedia) return;
    router.push(`/files/${firstMedia.file.id}?collection=${collectionId}`);
  }, [detail, collectionId, router]);

  const handleMoveUp = useCallback(
    async (index: number) => {
      if (!detail || index <= 0) return;
      const next = [
        ...detail.items.slice(0, index - 1),
        detail.items[index],
        detail.items[index - 1],
        ...detail.items.slice(index + 1),
      ];
      setDetail({ ...detail, items: next });
      try {
        await reorderCollectionItems(
          drive,
          collectionId,
          next.map((i) => i.id),
        );
      } catch {
        toast.error(t("errorReorder"));
        load();
      }
    },
    [detail, drive, collectionId, load, toast, t],
  );

  const handleMoveDown = useCallback(
    async (index: number) => {
      if (!detail || index >= detail.items.length - 1) return;
      const next = [
        ...detail.items.slice(0, index),
        detail.items[index + 1],
        detail.items[index],
        ...detail.items.slice(index + 2),
      ];
      setDetail({ ...detail, items: next });
      try {
        await reorderCollectionItems(
          drive,
          collectionId,
          next.map((i) => i.id),
        );
      } catch {
        toast.error(t("errorReorder"));
        load();
      }
    },
    [detail, drive, collectionId, load, toast, t],
  );

  const handleRemove = useCallback(
    async (itemId: number) => {
      if (!detail) return;
      const next = detail.items.filter((i) => i.id !== itemId);
      setDetail({ ...detail, items: next });
      try {
        await removeCollectionItem(drive, collectionId, itemId);
      } catch {
        toast.error(t("errorRemoveItem"));
        load();
      }
    },
    [detail, drive, collectionId, load, toast, t],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <button
          type="button"
          onClick={() => router.push(`/drive/${encodeURIComponent(drive)}`)}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={16} />
          {drive}
        </button>
        <p className="mt-6 text-text-muted">{t("notFound")}</p>
      </div>
    );
  }

  const items = detail.items;
  const files = items.map((i) => i.file);
  const hasMedia = items.some(
    (i) => i.file.file_type === "video" || i.file.file_type === "audio",
  );

  return (
    <TwoPaneLayout
      drive={drive}
      folderPath=""
      leftPane={
        <CollectionItemsPane
          items={items}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onRemove={handleRemove}
        />
      }
      leftPaneAriaLabel={t("itemListLabel")}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2">
          <TreeToggle drive={drive} />
          <Breadcrumb driveName={drive} trailingSegment={detail.name} />
        </div>

        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setNameDraft(detail.name);
                    setEditingName(false);
                  }
                }}
                className="w-full rounded-2xl bg-bg-card px-3 py-2 text-2xl font-semibold text-text-primary outline-none focus:ring-2 focus:ring-focus-ring"
              />
            ) : (
              <h1
                className="cursor-text rounded-2xl px-3 py-2 -ml-3 text-2xl font-semibold text-text-primary hover:bg-bg-elevated"
                onClick={() => {
                  setNameDraft(detail.name);
                  setEditingName(true);
                }}
              >
                {detail.name}
              </h1>
            )}

            {editingDescription ? (
              <textarea
                autoFocus
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={handleSaveDescription}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSaveDescription();
                  }
                  if (e.key === "Escape") {
                    setDescriptionDraft(detail.description ?? "");
                    setEditingDescription(false);
                  }
                }}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
                className="mt-2 w-full rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDescriptionDraft(detail.description ?? "");
                  setEditingDescription(true);
                }}
                className="mt-1 block w-full cursor-text rounded-2xl px-3 py-1 -ml-3 text-left text-sm text-text-muted hover:bg-bg-elevated"
              >
                {detail.description ?? (
                  <span className="text-text-muted/50">
                    {t("descriptionPlaceholder")}
                  </span>
                )}
              </button>
            )}

            <div className="mt-2 px-3 text-xs text-text-muted">
              {t("itemCount", { count: items.length })}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {hasMedia && (
              <button
                type="button"
                onClick={handlePlay}
                className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Play size={16} />
                {t("play")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeletingCollection(true)}
              className="rounded-2xl p-2 text-text-muted hover:bg-bg-elevated hover:text-danger"
              aria-label={t("deleteCollection")}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-muted">
            <p>{t("empty")}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-end">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </div>

            <FileNavigationOverrideProvider onNavigate={selectFile}>
              {viewMode === "grid" ? (
                <FileGrid files={files} onRefresh={load} />
              ) : (
                <FileList files={files} onRefresh={load} />
              )}
            </FileNavigationOverrideProvider>
          </>
        )}

        {deletingCollection && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setDeletingCollection(false)}
          >
            <div
              className="mx-4 w-full max-w-sm rounded-2xl border border-bg-border bg-bg-primary p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-base font-semibold text-text-primary">
                {t("confirmDeleteTitle")}
              </h3>
              <p className="mb-4 text-sm text-text-muted">
                {t("confirmDeleteBody", { name: detail.name })}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingCollection(false)}
                  className="rounded-2xl px-4 py-1.5 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-2xl bg-danger px-4 py-1.5 text-sm text-white hover:opacity-90"
                >
                  {t("deleteCollection")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TwoPaneLayout>
  );
}
