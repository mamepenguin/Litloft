/**
 * Each suite keeps its own `vi.mock()` lines: `vi.mock` is hoisted per file,
 * so a helper that called it for you would run in the wrong file.
 */
import { useEffect } from "react";
import { vi } from "vitest";
import { screen } from "@testing-library/react";

import * as api from "@/lib/api";
import type { FileRelationItem } from "@/lib/api";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import type { SlotEntry } from "@/lib/addons";
import type { FileItem } from "@/types";
import {
  PdfDocumentStore,
  type PdfController,
  type PdfDocumentState,
} from "@/lib/pdfController";
import {
  ArchiveContentsStore,
  type ArchiveController,
  type ArchiveState,
} from "@/lib/archiveController";

export const slotMocks = {
  occupied: new Set<string>(),
  entries: new Map<string, SlotEntry[]>(),
};

export const editableTagChipsCalls: Array<Record<string, unknown>> = [];

export const usePolicyMock = vi.fn();

export const overlaySidebarSpy = vi.fn();

export const publishedPdfState: { value: Partial<PdfDocumentState> | null } = {
  value: null,
};

export const publishedArchiveState: {
  value: Partial<ArchiveState> | null;
} = { value: null };

export const FilePreviewStub = vi.fn(
  ({
    onPdfController,
    onArchiveController,
  }: {
    onPdfController?: (c: PdfController | null) => void;
    onArchiveController?: (c: ArchiveController | null) => void;
  }) => {
    useEffect(() => {
      if (!onPdfController || !publishedPdfState.value) return;
      const store = new PdfDocumentStore();
      store.set(publishedPdfState.value);
      onPdfController(store);
      return () => onPdfController(null);
    }, [onPdfController]);
    useEffect(() => {
      if (!onArchiveController || !publishedArchiveState.value) return;
      const store = new ArchiveContentsStore();
      store.set(publishedArchiveState.value);
      onArchiveController(store);
      return () => onArchiveController(null);
    }, [onArchiveController]);
    return <div data-testid="file-preview" />;
  },
);

export const ActiveSummaryHostStub = () => (
  <div data-testid="active-summary-host" />
);

export const relationMocks: { value: FileRelationItem[] | null } = { value: [] };

export const useFileRelationsStub = () => relationMocks.value;

export const RelatedPanelStub = ({
  relations,
}: {
  relations: FileRelationItem[];
}) => <div data-testid="related-panel" data-count={relations.length} />;

export function withRelations(count = 1) {
  relationMocks.value = Array.from({ length: count }, (_, i) => ({
    relation_id: i + 1,
    kind: "related",
    direction: "outgoing" as const,
    origin: "markdown" as const,
    created_at: "2026-09-15T00:00:00Z",
    created_by: null,
    file: {
      id: `related${i}`.padEnd(12, "x"),
      drive: "main",
      filename: `related-${i}.md`,
      title: `Related ${i}`,
      folder_path: "",
      file_type: "document",
      mime_type: "text/markdown",
      thumbnail_url: "",
      has_thumbnail: false,
      file_size: 1,
      duration: null,
      missing_since: null,
      created_at: "2026-09-15T00:00:00Z",
      updated_at: "2026-09-15T00:00:00Z",
    },
  }));
}

export const ExifSectionStub = () => <div data-testid="exif" />;

export const CommentSectionStub = () => <div data-testid="comments" />;

export const FavoriteButtonStub = () => <div data-testid="favorite" />;

export const FileActionsStub = () => <div data-testid="file-actions" />;

export const CastButtonStub = () => <div data-testid="cast" />;

export const useAddonSlotsStub = () => ({
  addons: {},
  slots: {},
  loading: false,
  getSlotEntries: (slotId: string) => slotMocks.entries.get(slotId) ?? [],
  hasSlot: (slotId: string) => slotMocks.occupied.has(slotId),
});

export function claimSlot(slotId: string, entries: SlotEntry[]) {
  slotMocks.occupied.add(slotId);
  slotMocks.entries.set(slotId, entries);
}

export function SlotEntryRendererStub({
  entry,
  props,
}: {
  entry: SlotEntry;
  props: Record<string, unknown>;
}) {
  const report = props?.onAvailability as
    | ((available: boolean) => void)
    | undefined;
  return (
    <div
      data-testid={`slot-entry-${entry.id}`}
      data-fill-height={props?.fillHeight === true ? "true" : "false"}
      data-labelled-by-host={props?.labelledByHost === true ? "true" : "false"}
    >
      <button
        type="button"
        data-testid={`slot-entry-${entry.id}-empty`}
        onClick={() => report?.(false)}
      />
      <button
        type="button"
        data-testid={`slot-entry-${entry.id}-filled`}
        onClick={() => report?.(true)}
      />
    </div>
  );
}

export const useSidebarStub = () => ({
  requestRefresh: vi.fn(),
  isOpen: false,
  isOverlay: false,
  toggle: vi.fn(),
  close: vi.fn(),
  setOverlayMode: vi.fn(),
  refreshKey: 0,
});

export function AddonSlotStub({
  id,
  includeIds,
  excludeIds,
  props,
}: {
  id: string;
  includeIds?: string[];
  excludeIds?: string[];
  props?: Record<string, unknown>;
}) {
  const tag =
    id !== "file-detail-sections"
      ? id
      : includeIds
        ? `include:${includeIds.join(",")}`
        : excludeIds
          ? `exclude:${excludeIds.join(",")}`
          : "all";
  return (
    <div
      data-testid={`addon-slot-${tag}`}
      data-fill-height={props?.fillHeight === true ? "true" : "false"}
      data-prop-file-id={
        typeof props?.fileId === "string" ? props.fileId : undefined
      }
      data-prop-drive={typeof props?.drive === "string" ? props.drive : undefined}
    />
  );
}

export function MarkdownDocumentLayoutStub({
  title,
  inspector,
  mobileSheet,
  children,
}: {
  title: string;
  inspector: React.ReactNode;
  mobileSheet?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-testid="markdown-document-layout">
      <div data-testid="md-title">{title}</div>
      <div data-testid="md-canvas">{children}</div>
      <div data-testid="md-inspector">{inspector}</div>
      {mobileSheet !== undefined && (
        <div data-testid="md-mobile-sheet">{mobileSheet}</div>
      )}
    </div>
  );
}

export function EditableTagChipsStub(props: Record<string, unknown>) {
  editableTagChipsCalls.push(props);
  const { onSaveSuccess, onContentChange } = props as {
    onSaveSuccess?: () => void;
    onContentChange?: (next: string) => void;
  };
  return (
    <div data-testid="tag-chips-stub">
      <button
        type="button"
        data-testid="tag-save-trigger"
        onClick={() => onSaveSuccess?.()}
      >
        tags
      </button>
      <button
        type="button"
        data-testid="tag-content-write"
        onClick={() => onContentChange?.("---\ntags: [via-chips]\n---\nbody")}
      >
        content-write
      </button>
    </div>
  );
}

export function ChaptersPanelStub({
  onResolved,
  refreshToken,
  className,
}: {
  onResolved?: (n: number) => void;
  refreshToken?: number;
  className?: string;
}) {
  return (
    <div
      data-testid="chapters-panel"
      data-refresh-token={refreshToken}
      className={className}
    >
      <button
        data-testid="chapters-resolved-empty"
        onClick={() => onResolved?.(0)}
      />
    </div>
  );
}

export function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    drive: "main",
    folder_path: "",
    filename: "video.mp4",
    title: "Sample",
    description: "",
    file_type: "video",
    file_size: 1234,
    duration: 60,
    mime_type: "video/mp4",
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    has_thumbnail: true,
    created_at: "2026-05-10T00:00:00Z",
    updated_at: "2026-05-10T00:00:00Z",
    ...overrides,
  } as FileItem;
}

/**
 * `api.getFile` is called during the first commit, so waiting on the mock
 * having been called returns before the response lands.
 */
export const loaded = () => screen.findByTestId("file-actions");

export function setApiResponses(file: FileItem) {
  (api.getFile as ReturnType<typeof vi.fn>).mockResolvedValue(file);
  (api.recordFileView as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
}

/**
 * jsdom reports 1024px, which is under the inspector's default-open
 * threshold, so the inspector would render collapsed.
 */
export function setViewport(width = 1400) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  inspectorOpenStore.notifyViewportChange();
}
