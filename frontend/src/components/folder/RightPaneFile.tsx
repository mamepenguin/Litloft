"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { FileDetailContent } from "@/components/FileDetailContent";
import { FileDetailChrome } from "@/components/FileDetail/FileDetailChrome";
import { ImageGallery } from "@/components/ImageGallery";
import { useFileNav } from "@/hooks/useFileNav";
import { FileNavProvider } from "@/lib/fileNavContext";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { getFile } from "@/lib/api";
import { resolveFileNavOrdering } from "@/lib/fileNavOrdering";
import { normalizeSortParam } from "@/lib/sortField";
import type { FileItem } from "@/types";

interface RightPaneFileProps {
  fileId: string;
  drive: string;
}

/**
 * The right pane intentionally **does not** call ``useOverlaySidebar``;
 * the global sidebar stays inline because the tree pane already owns the
 * left-of-content slot.
 */
export function RightPaneFile({ fileId, drive }: RightPaneFileProps) {
  const t = useTranslations("rightPane");
  const { clearFile, selectFile } = useSelectedFile();
  const searchParams = useSearchParams();

  // FileDetailContent does its own fetch internally. The double fetch is
  // cheap and short-lived; sharing through context is overkill for
  // a single host that only needs file_type / mime_type / filename.
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; file: FileItem }
    | { status: "error" }
  >({ status: "loading" });
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Callback ref + state so FileDetailContent receives the actual DOM
  // element on first render (a useRef value would be null on the
  // initial pass).
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null);
  const setScrollRootCb = useCallback((el: HTMLDivElement | null) => {
    setScrollRoot(el);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getFile(fileId)
      .then((file) => {
        if (!cancelled) setState({ status: "loaded", file });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const file = state.status === "loaded" ? state.file : null;

  const navOrdering = resolveFileNavOrdering({ params: searchParams });

  const fileNav = useFileNav({
    fileId: file ? fileId : null,
    sort: navOrdering.sort,
    order: navOrdering.order,
    countable: navOrdering.countable,
    fileType: file?.file_type ?? null,
    mimeType: file?.mime_type ?? null,
    enabled: true,
    onNavigate: selectFile,
  });

  const tParam = searchParams.get("t");
  const pageParam = searchParams.get("page");
  const initialTime = tParam ? Number(tParam) : undefined;
  const initialPage = pageParam ? Number(pageParam) : undefined;
  const highlight = searchParams.get("highlight") ?? undefined;
  const sortQuery = normalizeSortParam(searchParams.get("sort"));
  const orderQuery = searchParams.get("order") ?? undefined;

  if (state.status === "loading") {
    return (
      <PaneShell chrome={<FileDetailChrome drive={drive} title="" />}>
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          {t("loading")}
        </div>
      </PaneShell>
    );
  }

  if (state.status === "error") {
    return (
      <PaneShell chrome={<FileDetailChrome drive={drive} title="" />}>
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          {t("notFound")}
        </div>
      </PaneShell>
    );
  }

  return (
    <>
      <PaneShell
        // No chrome from this host, ever. `FileDetailShell` draws the
        // row, and handing PaneShell a second row would stack two
        // identical bars. The loading and error states above still draw the
        // row, because there is no shell mounted yet to draw it.
        chrome={undefined}
        scrollRef={setScrollRootCb}
      >
        {/* The hook has to stay with the host because only the host
            knows what "navigate" means in its URL model. */}
        <FileNavProvider value={fileNav}>
          <FileDetailContent
            fileId={fileId}
            drive={drive}
            initialTime={initialTime}
            initialPage={initialPage}
            highlight={highlight}
            miniPlayerRoot={scrollRoot}
            onRequestImageGallery={() => setGalleryOpen(true)}
            onAfterDelete={clearFile}
          />
        </FileNavProvider>
      </PaneShell>
      {file && (
        <ImageGallery
          open={galleryOpen}
          file={file}
          sort={sortQuery}
          order={orderQuery}
          onClose={(currentFileId) => {
            setGalleryOpen(false);
            if (currentFileId && currentFileId !== fileId) {
              selectFile(currentFileId);
            }
          }}
        />
      )}
    </>
  );
}

function PaneShell({
  chrome,
  scrollRef,
  children,
}: {
  chrome?: React.ReactNode;
  scrollRef?: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-bg-primary">
      {chrome}
      <div
        ref={scrollRef}
        className={chrome ? "flex-1 overflow-auto p-4" : "flex-1 overflow-auto"}
      >
        {children}
      </div>
    </div>
  );
}
