"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FileDetailContent } from "@/components/FileDetailContent";
import { FileDetailChrome } from "@/components/FileDetail/FileDetailChrome";
import { FileRowAlignProvider } from "@/components/FileHeaderRowProvider";
import { ImageGallery } from "@/components/ImageGallery";
import {
  CollectionPanel,
  SmartQueuePanel,
  getCollectionOnEnded,
} from "@/components/CollectionPanel";
import { useSetOverrideDrive } from "@/components/CurrentDriveProvider";
import { ridesFileDetailShell } from "@/lib/fileDetailShell";
import { usePlainTextDocument } from "./FileDetail/hooks/usePlainTextDocument";
import { useOverlaySidebar } from "@/components/SidebarProvider";
import { useFileNav } from "@/hooks/useFileNav";
import { FileNavProvider } from "@/lib/fileNavContext";
import { InboxDetailHostProvider } from "@/components/inbox/inboxDetailHost";
import { usePolicy } from "@/hooks/usePolicy";
import { getDriveFiles, getFileShared, getSmartFolders } from "@/lib/api";
import { getSemanticAvailability } from "@/lib/addons";
import { peekFileSeed } from "@/lib/fileSeed";
import { fetchSemanticHits } from "@/lib/semanticSearch";
import { evaluateSmartCollection } from "@/lib/smartCollectionEval";
import {
  readSmartQueue,
  smartQueueEntry,
  smartQueueKey,
  storeSmartQueue,
  type SmartQueue,
} from "@/lib/smartQueue";
import { normalizeSortParam } from "@/lib/sortField";
import type { FileItem } from "@/types";

/**
 * A failed load is remembered for the tab, per Smart Collection, so later
 * navigations in the player do not run the evaluation again; a reload or a
 * new Play is what clears it.
 */
const failedSmartQueues = new Set<string>();
const smartQueueLoads = new Map<string, Promise<SmartQueue | null>>();

async function loadSmartQueue(
  drive: string,
  smartCollectionId: string,
): Promise<SmartQueue | null> {
  const key = smartQueueKey(drive, smartCollectionId);
  const running = smartQueueLoads.get(key);
  if (running) return running;

  const load = (async () => {
    try {
      const folders = await getSmartFolders(drive);
      const folder = folders.find((f) => f.id === smartCollectionId);
      if (!folder) return null;
      const result = await evaluateSmartCollection(
        {
          drive,
          query: folder.query.trim(),
          type: folder.file_type,
          sort: "relevance",
          order: "desc",
          includeSceneClip: false,
        },
        { getDriveFiles, getSemanticAvailability, fetchSemanticHits },
      );
      if (!result.complete) return null;
      const files = result.files.filter(
        (f) => f.file_type === "video" || f.file_type === "audio",
      );
      if (files.length === 0) return null;
      const queue: SmartQueue = {
        name: folder.name,
        files: files.map(smartQueueEntry),
      };
      storeSmartQueue(drive, smartCollectionId, queue);
      return queue;
    } catch {
      return null;
    } finally {
      smartQueueLoads.delete(key);
    }
  })();

  smartQueueLoads.set(key, load);
  return load;
}

interface FileDetailFullScreenProps {
  fileId: string;
}

export function FileDetailFullScreen({ fileId }: FileDetailFullScreenProps) {
  useOverlaySidebar();

  const router = useRouter();
  const searchParams = useSearchParams();
  const setOverrideDrive = useSetOverrideDrive();

  const nav = searchParams.get("nav") ?? undefined;
  const isInboxNav = nav === "inbox";
  const sort = normalizeSortParam(searchParams.get("sort"));
  const order = searchParams.get("order") || undefined;
  // `?playlist=` is accepted so bookmarks and external links keep working.
  const collectionParam =
    searchParams.get("collection") || searchParams.get("playlist") || undefined;
  const smartParam = searchParams.get("smart_collection") || undefined;
  const collectionId = collectionParam;
  const smartCollectionId = collectionId ? undefined : smartParam;
  const folderPlay =
    !collectionId &&
    !smartCollectionId &&
    searchParams.get("folder_play") === "1";
  const hasCollection = !!collectionId || !!smartCollectionId || folderPlay;
  const tParam = searchParams.get("t");
  const initialTime = tParam ? Number(tParam) : undefined;
  const pageParam = searchParams.get("page");
  const initialPage = pageParam ? Number(pageParam) : undefined;
  const sectionParam = searchParams.get("section");
  const initialSection = sectionParam ? Number(sectionParam) : undefined;
  const highlight = searchParams.get("highlight") || undefined;

  const [file, setFile] = useState<FileItem | null>(() => peekFileSeed(fileId));
  const [galleryOpen, setGalleryOpen] = useState(false);
  // The centred column is where the header's file row starts.
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const [smartQueue, setSmartQueue] = useState<SmartQueue | null>(null);
  const [smartPhase, setSmartPhase] = useState<"loading" | "failed" | "ready">(
    "loading",
  );
  const [smartAutoPlay, setSmartAutoPlay] = useState(false);

  // The provider's setter is not part of the request. Re-running this effect
  // on a new setter identity would drop the file it has already drawn and
  // fetch it again.
  const setOverrideDriveRef = useRef(setOverrideDrive);
  setOverrideDriveRef.current = setOverrideDrive;

  useEffect(() => {
    let cancelled = false;
    const seed = peekFileSeed(fileId);
    setFile(seed);
    if (seed) setOverrideDriveRef.current(seed.drive);
    getFileShared(fileId)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        setOverrideDriveRef.current(f.drive);
      })
      .catch(() => {
        if (!cancelled) setFile(null);
      });
    return () => {
      cancelled = true;
      setOverrideDriveRef.current(null);
    };
  }, [fileId]);

  const buildNavUrl = useCallback(
    (id: string) => {
      const params = new URLSearchParams();
      if (collectionId) params.set("collection", collectionId);
      else if (smartCollectionId) params.set("smart_collection", smartCollectionId);
      else if (folderPlay) params.set("folder_play", "1");
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      if (isInboxNav) params.set("nav", "inbox");
      const qs = params.toString();
      return `/files/${id}${qs ? `?${qs}` : ""}`;
    },
    [collectionId, smartCollectionId, folderPlay, sort, order, isInboxNav],
  );

  useEffect(() => {
    if (!smartCollectionId || !file?.drive) return;
    const drive = file.drive;
    const key = smartQueueKey(drive, smartCollectionId);
    const remembered = readSmartQueue(drive, smartCollectionId);
    if (remembered) {
      setSmartQueue(remembered);
      setSmartPhase("ready");
      setSmartAutoPlay(true);
      return;
    }
    setSmartQueue(null);
    setSmartAutoPlay(false);
    if (failedSmartQueues.has(key)) {
      setSmartPhase("failed");
      return;
    }
    setSmartPhase("loading");
    let cancelled = false;
    void loadSmartQueue(drive, smartCollectionId).then((queue) => {
      if (cancelled) return;
      if (!queue) failedSmartQueues.add(key);
      setSmartQueue(queue);
      setSmartPhase(queue ? "ready" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [smartCollectionId, file?.drive, fileId]);

  // Plain `router.replace` rather than useGuardedRouter: the dirty editor
  // lives in the 2-pane host, not the fullscreen host.
  const fileNav = useFileNav({
    fileId: !hasCollection && file ? fileId : null,
    sort,
    order,
    nav,
    drive: file?.drive ?? null,
    fileType: file?.file_type ?? null,
    mimeType: file?.mime_type ?? null,
    enabled: !hasCollection,
    onNavigate: (id) => router.replace(buildNavUrl(id)),
  });

  const inboxHref = useCallback(() => {
    const drive = file?.drive ?? "";
    return `/drive/${encodeURIComponent(drive)}?view=inbox`;
  }, [file]);

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
    if (isInboxNav) {
      router.push(inboxHref());
      return;
    }
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
  }, [router, file, isInboxNav, inboxHref]);

  const handleAfterDelete = useCallback(() => {
    if (!file) return;
    if (isInboxNav) {
      router.push(inboxHref());
      return;
    }
    const backPath = file.folder_path
      ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
      : `/drive/${encodeURIComponent(file.drive)}`;
    router.push(backPath);
  }, [router, file, isInboxNav, inboxHref]);

  // A Markdown note or an HTML preview rides `FileDetailShell`, which
  // draws the page row itself; drawing one here too would put two
  // breadcrumbs on the page.
  const knowledgeEditorPolicy = usePolicy(file?.drive ?? "", "knowledge", "editor");
  const { plainTextDocument } = usePlainTextDocument(
    file,
    file?.drive ?? "",
    knowledgeEditorPolicy,
  );
  const contentBringsItsOwnRow = ridesFileDetailShell({
    surface: "collection",
    mimeType: file?.mime_type,
    fileType: file?.file_type,
    knowledgeEditorEnabled: knowledgeEditorPolicy.enabled,
    plainTextDocument,
  });

  const isVideoTheater = hasCollection && file?.file_type === "video";
  const isAudioSide = hasCollection && file?.file_type !== "video";

  const renderQueuePanel = (target: FileItem) =>
    smartCollectionId ? (
      <SmartQueuePanel
        phase={smartPhase}
        queue={smartQueue}
        currentFileId={fileId}
        currentFileType={target.file_type}
        onNavigate={handleCollectionNavigate}
      />
    ) : (
      <CollectionPanel
        collectionId={collectionId}
        folderPlay={folderPlay}
        currentFileId={fileId}
        currentFileType={target.file_type}
        drive={target.drive}
        folderPath={target.folder_path}
        sort={sort}
        order={order}
        onNavigate={handleCollectionNavigate}
      />
    );

  return (
    <FileNavProvider value={fileNav}>
      <InboxDetailHostProvider
        value={{
          onNext: handleCollectionNavigate,
          onClose: () => router.push(inboxHref()),
        }}
      >
        <div
          ref={setColumn}
          className={`mx-auto w-full flex-1 px-4 py-6 ${hasCollection ? "max-w-6xl" : "max-w-5xl"}`}
        >
          <FileRowAlignProvider element={column}>
            {/* The back control keeps this route's own handler: "back" from a
                collection means the collection you were playing, not the
                folder the current track happens to live in. */}
            {!contentBringsItsOwnRow && (
              <FileDetailChrome
                drive={file?.drive ?? ""}
                folderPath={file?.folder_path}
                title={file ? file.title || file.filename : ""}
                fileId={file ? fileId : undefined}
                onBack={handleBack}
                // Until the file is known there is nothing to name.
                trail={!!file}
              />
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
                  autoPlay={hasCollection && (!smartCollectionId || smartAutoPlay)}
                  onRequestImageGallery={() => setGalleryOpen(true)}
                  onAfterDelete={handleAfterDelete}
                  onBack={handleBack}
                  surface="collection"
                />

                {isVideoTheater && renderQueuePanel(file!)}
              </div>

              {isAudioSide && file && renderQueuePanel(file)}
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
          </FileRowAlignProvider>
        </div>
      </InboxDetailHostProvider>
    </FileNavProvider>
  );
}
