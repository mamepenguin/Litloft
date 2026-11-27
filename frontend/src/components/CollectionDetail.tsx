"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, House, HousePlus, ListPlus, Play, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  deleteCollection,
  getCollection,
  removeCollectionItem,
  reorderCollectionItems,
  setHomeShortcut,
  updateCollection,
} from "@/lib/api";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Button } from "@/components/Button";
import { AddonSlot } from "@/components/AddonSlot";
import { ActionMenuItem } from "@/components/ActionMenuItem";
import { EmptyState } from "@/components/EmptyState";
import { OverflowMenu } from "@/components/OverflowMenu";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { CollectionItemsPane } from "@/components/CollectionItemsPane";
import { FileGrid } from "@/components/FileGrid";
import { FileList } from "@/components/FileList";
import { ViewToggle } from "@/components/ViewToggle";
import { QueuePageProvider, type QueuePageState } from "@/components/queue/QueuePageContext";
import { QueuePane } from "@/components/queue/QueuePane";
import { QueueTrail } from "@/components/queue/QueueTrail";
import { getLoop, setLoopStorage } from "@/components/queue/loopStorage";
import { clearPlayIntent, requestPlay } from "@/components/queue/playIntent";
import { setQueuePage } from "@/components/queue/queuePagePresence";
import {
  isPlayable,
  nextPlayableAfter,
  previousPlayableBefore,
  queueEntryFromFile,
  queueWalk,
} from "@/components/queue/queue";
import { useSetOverrideDrive } from "@/components/CurrentDriveProvider";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import { useToast } from "@/components/ToastProvider";
import { useCollectionViewMode } from "@/hooks/useCollectionViewMode";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { subscribeCollectionChanged } from "@/lib/collectionChanged";
import { FileNavigationOverrideProvider } from "@/lib/fileNavigationOverride";
import { useImeKeyGuard } from "@/lib/ime";
import { focusEnd, isNameInUse } from "@/lib/nameInUse";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";
import { useNameSubmission } from "@/hooks/useNameSubmission";
import type { CollectionDetail as CollectionDetailType } from "@/types";

interface CollectionDetailProps {
  drive: string;
  collectionId: string;
}

export function CollectionDetail({ drive, collectionId }: CollectionDetailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("collection");
  const tDrive = useTranslations("drive");
  const tPlayback = useTranslations("playback");
  const tShell = useTranslations("appShell");
  const tCommon = useTranslations("common");
  const ime = useImeKeyGuard();
  const toast = useToast();
  const setOverrideDrive = useSetOverrideDrive();
  const { fileId, selectFile } = useSelectedFile();

  const [detail, setDetail] = useState<CollectionDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loop, setLoop] = useState(() => getLoop());
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
  const homeInFlight = useRef(false);
  const nameSubmission = useNameSubmission();
  const { inUse: nameInUse, busy: nameBusy } = nameSubmission;
  const clearNameInUse = nameSubmission.clear;
  const beginName = nameSubmission.begin;
  const settleName = nameSubmission.settle;
  const rejectName = nameSubmission.reject;
  const resetName = nameSubmission.reset;
  const isNameBusy = nameSubmission.isBusy;
  const isNameRejected = nameSubmission.isRejected;
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameLineId = useId();

  useEffect(() => {
    if (nameInUse) focusEnd(nameInputRef.current);
  }, [nameInUse]);

  useEffect(() => {
    setOverrideDrive(drive);
    return () => setOverrideDrive(null);
  }, [drive, setOverrideDrive]);

  const collectionLoaded = detail !== null;
  useEffect(() => {
    setQueuePage(drive, collectionLoaded && fileId !== null);
    return () => setQueuePage(drive, false);
  }, [drive, collectionLoaded, fileId]);

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

  const reload = useCallback(async () => {
    try {
      const data = await getCollection(drive, collectionId);
      setDetail(data);
    } catch {
      // The old queue stays and nothing is shown.
    }
  }, [drive, collectionId]);

  useEffect(
    () =>
      subscribeCollectionChanged((change) => {
        if (change.drive !== drive) return;
        if (change.collectionId && change.collectionId !== collectionId) return;
        void reload();
      }),
    [drive, collectionId, reload],
  );

  const handleSaveName = useCallback(async () => {
    if (!detail) return;
    const next = nameDraft.trim();
    if (isNameBusy()) return;
    if (!next || next === detail.name) {
      setEditingName(false);
      return;
    }
    if (isNameRejected(next)) return;
    beginName();
    try {
      await updateCollection(drive, collectionId, { name: next });
      setDetail({ ...detail, name: next });
      setEditingName(false);
    } catch (e) {
      if (isNameInUse(e)) {
        rejectName(next);
        return;
      }
      setEditingName(false);
      toast.error(t("errorRename"));
      load();
    } finally {
      settleName();
    }
  }, [detail, drive, collectionId, nameDraft, load, toast, t, isNameBusy, isNameRejected, beginName, rejectName, settleName]);

  const cancelNameEdit = useCallback(() => {
    setNameDraft(detail?.name ?? "");
    setEditingName(false);
    resetName();
  }, [detail, resetName]);

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

  const handleToggleHome = useCallback(async () => {
    if (!detail || homeInFlight.current) return;
    homeInFlight.current = true;
    const next = !detail.on_home;
    try {
      await setHomeShortcut(drive, {
        kind: "collection",
        id: collectionId,
        on_home: next,
      });
      setDetail((previous) =>
        previous ? { ...previous, on_home: next } : previous,
      );
    } catch {
      toast.error(tDrive("homeShortcutFailed"));
    } finally {
      homeInFlight.current = false;
    }
  }, [detail, drive, collectionId, toast, tDrive]);

  const playFile = useCallback(
    (id: string) => {
      treeNarrowOpenStore.set(drive, false);
      requestPlay(id);
      selectFile(id);
    },
    [drive, selectFile],
  );

  const selectWithoutPlay = useCallback(
    (id: string) => {
      clearPlayIntent();
      selectFile(id);
    },
    [selectFile],
  );

  const handlePlay = useCallback(() => {
    if (!detail) return;
    const firstPlayable = detail.items.find((item) =>
      isPlayable(queueEntryFromFile(item.file)),
    );
    if (!firstPlayable) return;
    playFile(firstPlayable.file.id);
  }, [detail, playFile]);

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
        reload();
      }
    },
    [detail, drive, collectionId, reload, toast, t],
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
        reload();
      }
    },
    [detail, drive, collectionId, reload, toast, t],
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
        reload();
      }
    },
    [detail, drive, collectionId, reload, toast, t],
  );

  const items = useMemo(() => detail?.items ?? [], [detail?.items]);
  const entries = useMemo(
    () => items.map((item) => queueEntryFromFile(item.file)),
    [items],
  );
  const walk = useMemo(
    () => queueWalk(entries, fileId),
    [entries, fileId],
  );
  const listHref = pathname;

  const toggleLoop = useCallback(() => {
    setLoop((previous) => {
      const next = !previous;
      setLoopStorage(next);
      return next;
    });
  }, []);

  const navigatePrev = useCallback(() => {
    if (walk.prevId) playFile(walk.prevId);
  }, [walk.prevId, playFile]);

  const navigateNext = useCallback(() => {
    if (walk.nextId) playFile(walk.nextId);
  }, [walk.nextId, playFile]);

  const onEnded = useCallback(() => {
    if (!fileId) return;
    const next = nextPlayableAfter(entries, fileId, loop);
    if (next) playFile(next.id);
  }, [entries, fileId, loop, playFile]);

  const previousTrack = useCallback(() => {
    if (!fileId) return;
    const previous = previousPlayableBefore(entries, fileId, loop);
    if (previous) playFile(previous.id);
  }, [entries, fileId, loop, playFile]);

  const queuePage = useMemo<QueuePageState>(
    () => ({
      name: detail?.name ?? "",
      href: listHref,
      prevId: walk.prevId,
      nextId: walk.nextId,
      position: walk.position,
      total: walk.total,
      navigatePrev,
      navigateNext,
      onEnded,
      previousTrack,
    }),
    [
      detail?.name,
      listHref,
      walk,
      navigatePrev,
      navigateNext,
      onEnded,
      previousTrack,
    ],
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
      <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-12">
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

  const files = items.map((i) => i.file);
  const hasPlayable = items.some((i) => isPlayable(queueEntryFromFile(i.file)));
  const currentFileTitle =
    items.find((item) => item.file.id === fileId)?.file.title ?? fileId ?? "";

  const leftPane = (
    <QueuePane
      name={detail.name}
      href={listHref}
      showPosition={fileId !== null}
      position={walk.position}
      total={walk.total}
      loop={loop}
      onToggleLoop={toggleLoop}
    >
      <CollectionItemsPane
        items={items}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onRemove={handleRemove}
        onSelect={fileId ? playFile : undefined}
        scrollCurrentIntoView={fileId !== null}
      />
    </QueuePane>
  );

  return (
    <QueuePageProvider value={queuePage}>
      {fileId && (
        <QueueTrail
          drive={drive}
          name={detail.name}
          href={listHref}
          fileTitle={currentFileTitle}
        />
      )}
      <TwoPaneLayout
        drive={drive}
        folderPath=""
        queuePane={fileId !== null}
        leftPane={leftPane}
        leftPaneAriaLabel={fileId ? tPlayback("queueLabel") : t("itemListLabel")}
      >
      {/* No `px-4` here: PageHeader carries its own, and an outer one would
          indent the header past everything under it. */}
      <PageFrame
        width="wide"
        header={
          <PageHeader
            breadcrumb={<Breadcrumb driveName={drive} driveIsAncestor />}
            title={
              editingName ? (
                <span className="block w-full whitespace-normal">
                  <input
                    ref={nameInputRef}
                    autoFocus
                    value={nameDraft}
                    readOnly={nameBusy}
                    aria-invalid={nameInUse ? true : undefined}
                    aria-describedby={nameInUse ? nameLineId : undefined}
                    onChange={(e) => {
                      setNameDraft(e.target.value);
                      clearNameInUse();
                    }}
                    onBlur={() => {
                      if (nameBusy) return;
                      if (nameInUse) {
                        focusEnd(nameInputRef.current);
                        return;
                      }
                      handleSaveName();
                    }}
                    onCompositionEnd={ime.onCompositionEnd}
                    onKeyDown={(e) => {
                      if (ime.isImeKeystroke(e)) return;
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape" && !nameBusy) cancelNameEdit();
                    }}
                    // Inside the <h1>, but an <input> does not inherit type, so
                    // the heading size is repeated here and only here.
                    className={`w-full rounded-2xl bg-bg-card px-3 py-1 text-2xl font-bold text-text-primary outline-none focus:ring-2 ${
                      nameInUse ? "ring-2 ring-danger focus:ring-danger" : "focus:ring-focus-ring"
                    }`}
                  />
                  {nameInUse && (
                    <span id={nameLineId} className="mt-1 block text-xs text-danger">
                      {tCommon("nameInUse")}
                    </span>
                  )}
                </span>
              ) : (
                // A <button>, not an <h1>: PageHeader supplies the heading, and
                // nesting one inside it would be invalid.
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(detail.name);
                    setEditingName(true);
                  }}
                  className="-ml-2 block max-w-full cursor-text truncate rounded-2xl px-2 py-0.5 text-left hover:bg-bg-elevated"
                >
                  {detail.name}
                </button>
              )
            }
            scope={
              <>
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
                    className="w-full rounded-2xl bg-bg-card px-3 py-2 text-base text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDescriptionDraft(detail.description ?? "");
                      setEditingDescription(true);
                    }}
                    className="-ml-2 block w-full cursor-text rounded-2xl px-2 py-0.5 text-left text-base leading-relaxed text-text-primary hover:bg-bg-elevated"
                  >
                    {detail.description ?? (
                      <span className="text-text-muted/50">
                        {t("descriptionPlaceholder")}
                      </span>
                    )}
                  </button>
                )}
                <div className="mt-1 text-xs text-text-muted">
                  {t("itemCount", { count: items.length })}
                </div>
              </>
            }
            actions={
              <>
                {hasPlayable && (
                  <Button variant="primary" onClick={handlePlay}>
                    <Play size={16} />
                    {t("play")}
                  </Button>
                )}
                <AddonSlot
                  id="collection-actions"
                  layout="stack"
                  props={{
                    drive,
                    collectionId,
                    collectionName: detail.name,
                  }}
                />
                {/* Behind `…`: an icon-only Trash beside the screen's primary
                    action put a destructive control one mis-aimed tap from
                    Play. */}
                <OverflowMenu label={t("moreActions", { name: detail.name })}>
                  {(close) => (
                    <>
                      <ActionMenuItem
                        icon={detail.on_home ? House : HousePlus}
                        label={
                          detail.on_home
                            ? tShell("removeFromHome")
                            : tShell("putOnHome")
                        }
                        onClick={() => {
                          close();
                          void handleToggleHome();
                        }}
                      />
                      <ActionMenuItem
                        icon={Trash2}
                        danger
                        label={t("deleteCollection")}
                        onClick={() => {
                          close();
                          setDeletingCollection(true);
                        }}
                      />
                    </>
                  )}
                </OverflowMenu>
              </>
            }
          />
        }
      >

        <div className="px-4 pb-6">
        {items.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            primaryAction={{
              label: t("emptyAction"),
              href: `/drive/${encodeURIComponent(drive)}`,
            }}
          />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-end">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </div>

            <FileNavigationOverrideProvider onNavigate={selectWithoutPlay}>
              {viewMode === "grid" ? (
                <FileGrid files={files} onRefresh={load} />
              ) : (
                <FileList files={files} onRefresh={load} showOrdinals />
              )}
            </FileNavigationOverrideProvider>
          </>
        )}
        </div>

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
      </PageFrame>
      </TwoPaneLayout>
    </QueuePageProvider>
  );
}
