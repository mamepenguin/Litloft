"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FileDetailContent } from "@/components/FileDetailContent";
import { FileDetailChrome } from "@/components/FileDetail/FileDetailChrome";
import { ImageGallery } from "@/components/ImageGallery";
import {
  CollectionPanel,
  getCollectionOnEnded,
} from "@/components/CollectionPanel";
import { useSetOverrideDrive } from "@/components/CurrentDriveProvider";
import { usePolicy } from "@/hooks/usePolicy";
import { usesDocumentShell } from "@/lib/fileDetailShell";
import { useOverlaySidebar } from "@/components/SidebarProvider";
import { useFileNav } from "@/hooks/useFileNav";
import { getFile } from "@/lib/api";
import { normalizeSortParam } from "@/lib/sortField";
import type { FileItem } from "@/types";

interface FileDetailFullScreenProps {
  fileId: string;
}

/**
 * Fullscreen route host for ``/files/{id}``. Used in two situations
 * (per spec §4.6 / §4.7):
 *
 * 1. ``?collection=`` (legacy alias: ``?playlist=``) / ``?folder_play=1``
 *    is set — the spec keeps the collection-exception route fullscreen
 *    (2-pane离脱) so the CollectionPanel and the player share the same
 *    visual focus.
 * 2. (Future) any URL the Server Component decides not to redirect.
 *
 * Composes ``<FileDetailContent>`` with the chrome the legacy
 * `/files/[id]/page.tsx` carried: a back button, ImageGallery on
 * Maximize, CollectionPanel when in collection mode, useOverlaySidebar
 * to collapse the global sidebar to overlay, and useFileNav for
 * arrow-key navigation in non-collection mode.
 */
export function FileDetailFullScreen({ fileId }: FileDetailFullScreenProps) {
  // Unlike RightPaneFile, the fullscreen host DOES collapse the
  // global sidebar — there's no tree pane next to us, so the inline
  // sidebar would just steal width from the player.
  useOverlaySidebar();

  const router = useRouter();
  const searchParams = useSearchParams();
  const setOverrideDrive = useSetOverrideDrive();

  const sort = normalizeSortParam(searchParams.get("sort"));
  const order = searchParams.get("order") || undefined;
  // Spec 2026-05-12-playlist-to-collection §6.4: prefer ``?collection=``
  // but accept the legacy ``?playlist=`` for one release so bookmarks
  // and external links keep working. Phase 4 removes the legacy alias.
  const collectionId =
    searchParams.get("collection") || searchParams.get("playlist") || undefined;
  const folderPlay = searchParams.get("folder_play") === "1";
  const hasCollection = !!collectionId || folderPlay;
  const tParam = searchParams.get("t");
  const initialTime = tParam ? Number(tParam) : undefined;
  const pageParam = searchParams.get("page");
  const initialPage = pageParam ? Number(pageParam) : undefined;
  const highlight = searchParams.get("highlight") || undefined;

  // Local file state for chrome (back nav, ImageGallery, override drive).
  // FileDetailContent does its own getFile internally — accepted dual
  // fetch is short and cheap.
  const [file, setFile] = useState<FileItem | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    getFile(fileId)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        // Tell the global sidebar what drive we're "on" since the
        // URL doesn't carry it.
        setOverrideDrive(f.drive);
      })
      .catch(() => {
        // 404 / network errors fall through to a blank chrome; the
        // FileDetailContent below renders its own loading spinner
        // and the user can navigate away with the browser's back.
      });
    return () => {
      cancelled = true;
      setOverrideDrive(null);
    };
  }, [fileId, setOverrideDrive]);

  const buildNavUrl = useCallback(
    (id: string) => {
      const params = new URLSearchParams();
      if (collectionId) params.set("collection", collectionId);
      if (folderPlay) params.set("folder_play", "1");
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      const qs = params.toString();
      return `/files/${id}${qs ? `?${qs}` : ""}`;
    },
    [collectionId, folderPlay, sort, order],
  );

  // Arrow-key navigation. Disabled in collection mode — the collection
  // owns "next" semantics there; ArrowLeft/Right would conflict.
  // PR-5: ``router.replace`` here is the legacy router (no
  // useGuardedRouter wrapper) but it doesn't matter — the dirty
  // editor lives in the 2-pane host, not the fullscreen host. The
  // global popstate / beforeunload listeners in ``<DirtyBlocker />``
  // catch any escape paths.
  useFileNav({
    fileId: !hasCollection && file ? fileId : null,
    sort,
    order,
    fileType: file?.file_type ?? null,
    mimeType: file?.mime_type ?? null,
    enabled: !hasCollection,
    onNavigate: (id) => router.replace(buildNavUrl(id)),
  });

  const handleCollectionNavigate = useCallback(
    (nextFileId: string) => {
      router.replace(buildNavUrl(nextFileId));
    },
    [router, buildNavUrl],
  );

  const handleMediaEnded = useCallback(() => {
    const onEnded = getCollectionOnEnded();
    if (onEnded) onEnded();
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (file) {
      const backPath = file.folder_path
        ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
        : `/drive/${encodeURIComponent(file.drive)}`;
      router.push(backPath);
    }
  }, [router, file]);

  const handleAfterDelete = useCallback(() => {
    if (!file) return;
    const backPath = file.folder_path
      ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
      : `/drive/${encodeURIComponent(file.drive)}`;
    router.push(backPath);
  }, [router, file]);

  // A Markdown note or an HTML preview rides `FileDetailShell`, which
  // draws the page row itself. Drawing one here too would put two
  // breadcrumbs on the page and, on a phone, two back controls — the
  // thing this row exists to stop. Same predicate as the 2-pane host
  // and the content itself, from one place so it cannot be got right in
  // two of the three.
  const knowledgeEditorPolicy = usePolicy(file?.drive ?? "", "knowledge", "editor");
  const contentBringsItsOwnRow = usesDocumentShell(
    file?.mime_type,
    knowledgeEditorPolicy.enabled,
  );

  const isVideoTheater = hasCollection && file?.file_type === "video";
  const isAudioSide = hasCollection && file?.file_type !== "video";

  return (
    <div
      className={`mx-auto w-full flex-1 px-4 py-6 ${hasCollection ? "max-w-6xl" : "max-w-5xl"}`}
    >
      {/* The same page row every other file detail surface wears. The
          back control keeps this route's own handler: "back" from a
          collection means the collection you were playing, not the
          folder the current track happens to live in. The tree pane
          does not exist here, so its toggle is left out. */}
      {!contentBringsItsOwnRow && (
        <div className="mb-4 -mx-4 -mt-6">
          {file ? (
            <FileDetailChrome
              drive={file.drive}
              folderPath={file.folder_path}
              title={file.title || file.filename}
              onBack={handleBack}
              showTreeToggle={false}
            />
          ) : (
            // The row cannot be drawn before the file names its own
            // folder, but it can hold its place: without this the whole
            // page steps down 48px the moment the fetch lands.
            <div
              aria-hidden
              className="h-12 border-b border-bg-border bg-bg-card"
            />
          )}
        </div>
      )}

      <div className={isAudioSide ? "flex flex-col gap-4 md:flex-row" : ""}>
        <div className={isAudioSide ? "min-w-0 flex-1" : ""}>
          <FileDetailContent
            fileId={fileId}
            drive={file?.drive ?? ""}
            initialTime={initialTime}
            initialPage={initialPage}
            highlight={highlight}
            onEnded={hasCollection ? handleMediaEnded : undefined}
            autoPlay={hasCollection}
            onRequestImageGallery={() => setGalleryOpen(true)}
            onAfterDelete={handleAfterDelete}
            onBack={handleBack}
          />

          {isVideoTheater && (
            <CollectionPanel
              collectionId={collectionId}
              folderPlay={folderPlay}
              currentFileId={fileId}
              currentFileType={file!.file_type}
              drive={file!.drive}
              folderPath={file!.folder_path}
              sort={sort}
              order={order}
              onNavigate={handleCollectionNavigate}
            />
          )}
        </div>

        {isAudioSide && file && (
          <CollectionPanel
            collectionId={collectionId}
            folderPlay={folderPlay}
            currentFileId={fileId}
            currentFileType={file.file_type}
            drive={file.drive}
            folderPath={file.folder_path}
            sort={sort}
            order={order}
            onNavigate={handleCollectionNavigate}
          />
        )}
      </div>

      {file && (
        <ImageGallery
          open={galleryOpen}
          file={file}
          sort={sort}
          order={order}
          onClose={(currentFileId) => {
            setGalleryOpen(false);
            if (currentFileId && currentFileId !== fileId) {
              router.replace(buildNavUrl(currentFileId));
            }
          }}
        />
      )}
    </div>
  );
}
