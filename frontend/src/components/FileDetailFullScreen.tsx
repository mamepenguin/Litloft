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
import { ridesFileDetailShell } from "@/lib/fileDetailShell";
import { useOverlaySidebar } from "@/components/SidebarProvider";
import { useFileNav } from "@/hooks/useFileNav";
import { getFileShared } from "@/lib/api";
import { peekFileSeed } from "@/lib/fileSeed";
import { normalizeSortParam } from "@/lib/sortField";
import type { FileItem } from "@/types";

interface FileDetailFullScreenProps {
  fileId: string;
}

export function FileDetailFullScreen({ fileId }: FileDetailFullScreenProps) {
  useOverlaySidebar();

  const router = useRouter();
  const searchParams = useSearchParams();
  const setOverrideDrive = useSetOverrideDrive();

  const sort = normalizeSortParam(searchParams.get("sort"));
  const order = searchParams.get("order") || undefined;
  // `?playlist=` is accepted so bookmarks and external links keep working.
  const collectionId =
    searchParams.get("collection") || searchParams.get("playlist") || undefined;
  const folderPlay = searchParams.get("folder_play") === "1";
  const hasCollection = !!collectionId || folderPlay;
  const tParam = searchParams.get("t");
  const initialTime = tParam ? Number(tParam) : undefined;
  const pageParam = searchParams.get("page");
  const initialPage = pageParam ? Number(pageParam) : undefined;
  const sectionParam = searchParams.get("section");
  const initialSection = sectionParam ? Number(sectionParam) : undefined;
  const highlight = searchParams.get("highlight") || undefined;

  const [file, setFile] = useState<FileItem | null>(() => peekFileSeed(fileId));
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const seed = peekFileSeed(fileId);
    setFile(seed);
    if (seed) setOverrideDrive(seed.drive);
    getFileShared(fileId)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        setOverrideDrive(f.drive);
      })
      .catch(() => {
        if (!cancelled) setFile(null);
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

  // Plain `router.replace` rather than useGuardedRouter: the dirty editor
  // lives in the 2-pane host, not the fullscreen host.
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
  // draws the page row itself; drawing one here too would put two
  // breadcrumbs on the page.
  const knowledgeEditorPolicy = usePolicy(file?.drive ?? "", "knowledge", "editor");
  const contentBringsItsOwnRow = ridesFileDetailShell({
    surface: "collection",
    mimeType: file?.mime_type,
    fileType: file?.file_type,
    knowledgeEditorEnabled: knowledgeEditorPolicy.enabled,
  });

  const isVideoTheater = hasCollection && file?.file_type === "video";
  const isAudioSide = hasCollection && file?.file_type !== "video";

  return (
    <div
      className={`mx-auto w-full flex-1 px-4 py-6 ${hasCollection ? "max-w-6xl" : "max-w-5xl"}`}
    >
      {/* The back control keeps this route's own handler: "back" from a
          collection means the collection you were playing, not the
          folder the current track happens to live in. */}
      {!contentBringsItsOwnRow && (
        <div className="mb-4 -mx-4 -mt-6">
          {file ? (
            <FileDetailChrome
              drive={file.drive}
              folderPath={file.folder_path}
              title={file.title || file.filename}
              onBack={handleBack}
            />
          ) : (
            // Holds the row's place so the page does not step down when
            // the fetch lands.
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
            initialSection={initialSection}
            highlight={highlight}
            onEnded={hasCollection ? handleMediaEnded : undefined}
            autoPlay={hasCollection}
            onRequestImageGallery={() => setGalleryOpen(true)}
            onAfterDelete={handleAfterDelete}
            onBack={handleBack}
            surface="collection"
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
