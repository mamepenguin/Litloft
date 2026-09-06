"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { FileDetailContent } from "@/components/FileDetailContent";
import { FileDetailChrome } from "@/components/FileDetail/FileDetailChrome";
import { ImageGallery } from "@/components/ImageGallery";
import { useFileNav } from "@/hooks/useFileNav";
import { FileNavProvider } from "@/lib/fileNavContext";
import { usePolicy } from "@/hooks/usePolicy";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { getFile } from "@/lib/api";
import { ridesFileDetailShell } from "@/lib/fileDetailShell";
import { normalizeSortParam } from "@/lib/sortField";
import type { FileItem } from "@/types";

interface RightPaneFileProps {
  fileId: string;
  drive: string;
}

/**
 * 2-pane right column: full file detail equivalent to the legacy
 * ``/files/{id}`` page, sans navigation chrome.
 *
 * PR-4 of the right-pane equivalence merger spec
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md, hako
 * HI8TFfXzwyPVtgBqlR6P1, §3.4 host responsibilities). Reverses the
 * Topic 7 "minimal preview" model: the pane now hosts ``<FileDetailContent>``
 * (PR-3) plus the host-side concerns the spec keeps out of that
 * shared component:
 *
 *   - ``<ImageGallery>`` mount + galleryOpen state (H2)
 *   - ``useFileNav`` arrow-key navigation (PR-2; `?file=` swap)
 *   - scroll-container ref forwarded as ``miniPlayerRoot`` so the
 *     mini player's IntersectionObserver lives on the right-pane
 *     scroll surface (PR-1, B1)
 *   - chrome: TreeToggle + close ✕ (mobile back ←)
 *
 * Per §3.4 the right pane intentionally **does not** call
 * ``useOverlaySidebar``; the global sidebar stays inline because the
 * tree pane already owns the left-of-content slot. Collection mode is
 * 2-pane-exempt (§4.6) and lives in the PR-5 fullscreen route, so we
 * never need ``<CollectionPanel>`` here.
 */
export function RightPaneFile({ fileId, drive }: RightPaneFileProps) {
  const t = useTranslations("rightPane");
  const { clearFile, selectFile } = useSelectedFile();
  const searchParams = useSearchParams();

  // Chrome title + ImageGallery + useFileNav need the file metadata
  // before <FileDetailContent> renders (and FileDetailContent does
  // its own fetch internally, per spec §3.2). The double fetch is
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
  // initial pass). The mini player's IO uses this as its root.
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

  // A file that rides `FileDetailShell` draws its own page row, because
  // the shell also owns the inspector toggle that sits in it. This host
  // must not draw a second one. This is the canonical surface, so every
  // kind that has been moved onto the shell rides it here.
  //
  // `usePolicy` is fail-open: it reports enabled during both the initial
  // load and the 30s-TTL background refetch. Only `enabled` is read, so
  // the periodic refetch cannot flip the branch out from under an open
  // editor — which would unmount the textarea and re-fire every child
  // effect, the observed 30-second reload-while-typing bug.
  const knowledgeEditorPolicy = usePolicy(drive, "knowledge", "editor");
  const contentBringsItsOwnRow = ridesFileDetailShell({
    surface: "canonical",
    mimeType: file?.mime_type,
    fileType: file?.file_type,
    knowledgeEditorEnabled: knowledgeEditorPolicy.enabled,
  });

  // Drive arrow-key navigation through useFileNav (PR-2). selectFile
  // swaps ``?file=id`` so FileDetailContent re-mounts with the
  // neighbor's id. Sort / order from the URL keep the nav order in
  // sync with what the folder view used before the user dove in.
  // PR-5: ``selectFile`` itself routes through ``navigationGuard`` so
  // a dirty editor on the current file gets the global ``DirtyBlocker``
  // dialog before the swap fires; this hook stays surface-agnostic.
  const fileNav = useFileNav({
    fileId: file ? fileId : null,
    sort: normalizeSortParam(searchParams.get("sort")),
    order: searchParams.get("order") ?? undefined,
    fileType: file?.file_type ?? null,
    mimeType: file?.mime_type ?? null,
    enabled: true,
    onNavigate: selectFile,
  });

  // Forward URL hints into FilePreview via FileDetailContent. ``t`` /
  // ``page`` / ``highlight`` are deep-link locators (citation jumps,
  // PDF anchors, Markdown highlights); they tolerate being undefined.
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

  const title = file?.title || file?.filename || "";

  return (
    <>
      <PaneShell
        // The document shell draws its own copy of this row, inspector
        // toggle and all, so handing it a second one would stack two
        // identical bars.
        chrome={
          contentBringsItsOwnRow ? undefined : (
            <FileDetailChrome
              drive={drive}
              folderPath={file?.folder_path}
              title={title}
            />
          )
        }
        scrollRef={setScrollRootCb}
      >
        {/* Published rather than passed down: the page row that draws
            the visible prev / next sits four components below here, and
            the hook has to stay with the host because only the host
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
            // ImageGallery may have advanced the user to a sibling
            // image while open; reflect that selection in `?file=`
            // so the right pane shows the same file it left them on.
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
  /**
   * The page row. Omitted when the inner content supplies its own —
   * `FileDetailShell` carries the same `FileDetailChrome` internally
   * because it also owns the inspector toggle that sits in it.
   */
  chrome?: React.ReactNode;
  /**
   * Optional callback ref attached to the scroll container so the
   * outer ``RightPaneFile`` can pass it down to the mini player as
   * its IntersectionObserver root.
   */
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
