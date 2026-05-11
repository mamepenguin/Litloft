"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { FileDetailContent } from "@/components/FileDetailContent";
import { ImageGallery } from "@/components/ImageGallery";
import { TreeToggle } from "@/components/TreeToggle";
import { useFileNav } from "@/hooks/useFileNav";
import { usePolicy } from "@/hooks/usePolicy";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { getFile } from "@/lib/api";
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
 * tree pane already owns the left-of-content slot. Playlist mode is
 * 2-pane-exempt (§4.6) and lives in the PR-5 fullscreen route, so we
 * never need ``<PlaylistPanel>`` here.
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

  // 2026-05-11 chrome consolidation: when FileDetailContent will mount
  // the MarkdownDocumentLayout fork, that layout renders its own unified
  // chrome (TreeToggle + title + view mode + Inspector toggle). The
  // PaneShell header would duplicate the title bar, so we suppress it
  // here. Mirror the same predicate used inside FileDetailContent for
  // ``useDocumentLayout`` (mime_type + Knowledge editor policy).
  const knowledgeEditorPolicy = usePolicy(drive, "knowledge", "editor");
  const willUseDocumentLayout =
    file?.mime_type === "text/markdown" &&
    !knowledgeEditorPolicy.isLoading &&
    knowledgeEditorPolicy.enabled;

  // Drive arrow-key navigation through useFileNav (PR-2). selectFile
  // swaps ``?file=id`` so FileDetailContent re-mounts with the
  // neighbor's id. Sort / order from the URL keep the nav order in
  // sync with what the folder view used before the user dove in.
  // PR-5: ``selectFile`` itself routes through ``navigationGuard`` so
  // a dirty editor on the current file gets the global ``DirtyBlocker``
  // dialog before the swap fires; this hook stays surface-agnostic.
  useFileNav({
    fileId: file ? fileId : null,
    sort: searchParams.get("sort") ?? undefined,
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
  const sortQuery = searchParams.get("sort") ?? undefined;
  const orderQuery = searchParams.get("order") ?? undefined;

  if (state.status === "loading") {
    return (
      <PaneShell title="" drive={drive}>
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          {t("loading")}
        </div>
      </PaneShell>
    );
  }

  if (state.status === "error") {
    return (
      <PaneShell title="" drive={drive}>
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
        title={title}
        drive={drive}
        scrollRef={setScrollRootCb}
        hideHeader={willUseDocumentLayout}
      >
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
  title,
  drive,
  scrollRef,
  hideHeader,
  children,
}: {
  title: string;
  drive: string;
  /**
   * Optional callback ref attached to the scroll container so the
   * outer ``RightPaneFile`` can pass it down to the mini player as
   * its IntersectionObserver root.
   */
  scrollRef?: (el: HTMLDivElement | null) => void;
  /**
   * Skip the pane's own title bar. Used when the inner content (e.g.
   * MarkdownDocumentLayout) supplies its own unified chrome and the
   * default TreeToggle / title row would duplicate it.
   */
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-bg-base">
      {!hideHeader && (
        // Mirror the MarkdownDocumentLayout chrome shell (h-12, bg-bg-card,
        // px-3, gap-2, border-b) so the file detail surface stays
        // visually consistent regardless of whether the file is a
        // Markdown note with its own document layout chrome or a
        // generic non-Markdown file using this header.
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-bg-border bg-bg-card px-3">
          {/* TreeToggle leftmost. Hidden on mobile because the mobile
              layout uses a tree ⇄ file-detail screen swap (no 2-pane
              split), which makes the toggle visually a no-op while a
              file is open. Mobile users can navigate back via the
              browser / OS back gesture and re-enable the tree from the
              folder view's TreeToggle. */}
          <div className="hidden md:flex">
            <TreeToggle drive={drive} />
          </div>
          <h2
            className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary"
            title={title}
          >
            {title}
          </h2>
        </div>
      )}
      <div
        ref={scrollRef}
        className={hideHeader ? "flex-1 overflow-auto" : "flex-1 overflow-auto p-4"}
      >
        {children}
      </div>
    </div>
  );
}
