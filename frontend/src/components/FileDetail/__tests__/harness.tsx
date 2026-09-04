/**
 * Shared stubs for the FileDetail suites.
 *
 * The suites that mount the real `FileDetailContent` — the surface's
 * contract, its media canvas, and its page row — need the same heavy
 * children replaced, so the stub bodies live here and each suite keeps
 * only its own
 * `vi.mock()` lines. Those lines cannot move: `vi.mock` is hoisted per
 * file, so a helper that called it for you would run in the wrong file.
 * What they can do is `await import("./harness")` inside the factory,
 * which is why every stub below is exported rather than inlined.
 *
 * `state` is mutable on purpose. It is how a test says "an addon claims
 * this slot" or "the policy is still loading" without re-mocking.
 */
import { vi } from "vitest";
import { screen } from "@testing-library/react";

import * as api from "@/lib/api";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import type { SlotEntry } from "@/lib/addons";
import type { FileItem } from "@/types";

/**
 * Which slots an addon has claimed, and with what.
 *
 * `occupied` answers `hasSlot`, which is all most suites need. `entries`
 * answers `getSlotEntries`, which the inspector's tab strip reads —
 * there one tab is one entry, so a test that wants two tabs has to say
 * what the second one is.
 */
export const slotMocks = {
  occupied: new Set<string>(),
  entries: new Map<string, SlotEntry[]>(),
};

/** Props every `EditableTagChips` render was given, newest last. */
export const editableTagChipsCalls: Array<Record<string, unknown>> = [];

/** Stands in for `usePolicy`; each suite's `beforeEach` sets a return. */
export const usePolicyMock = vi.fn();

/**
 * Detects any accidental `useOverlaySidebar()` call. The contract
 * (spec 2026-05-09 §3.2, §3.4) says FileDetailContent must NOT touch
 * overlay state — the host is responsible for that.
 */
export const overlaySidebarSpy = vi.fn();

export const FilePreviewStub = vi.fn(() => <div data-testid="file-preview" />);

export const ActiveSummaryHostStub = () => (
  <div data-testid="active-summary-host" />
);

export const RelatedFilesSectionStub = () => <div data-testid="related-files" />;

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

/** One addon entry in a slot, and `hasSlot` told about it as well. */
export function claimSlot(slotId: string, entries: SlotEntry[]) {
  slotMocks.occupied.add(slotId);
  slotMocks.entries.set(slotId, entries);
}

/**
 * Stands in for an addon's own component, wherever it is placed.
 *
 * The two buttons are how a test plays the addon's part. `onAvailability`
 * is the entry's channel for saying whether it has anything for this
 * file, and pressing them is the only way to exercise it from outside —
 * the alternative, asserting that core passed *a function*, would go on
 * passing after core stopped honouring the answer.
 */
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
  // Surface the filter intent to the DOM so tests can assert which
  // copy of the slot (canvas vs. inspector) ran.
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

/**
 * Core's own companion occupant. Mocked like the other heavy children:
 * what it renders is its own test's business, while these files care
 * only that the host places it and counts it as an occupant. The button
 * lets a test fire `onResolved` at a moment it controls, rather than
 * racing an effect.
 */
export function ChaptersPanelStub({
  onResolved,
  refreshToken,
  className,
}: {
  onResolved?: (n: number) => void;
  refreshToken?: number;
  className?: string;
}) {
  // `className` is passed through because it is the host's half of the
  // contract: the panel sits in three regions with three height budgets
  // and holds none of them itself, so a stub that dropped the class
  // would make every one of those placements look identical.
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
 * Wait for the fetched file to be on screen, not merely requested.
 *
 * `api.getFile` is called during the first commit, so a wait on the mock
 * having been called is already true the moment it runs: it returns before
 * the response lands, leaving every synchronous query after it racing the
 * state update. `FileActions` renders only past the `!file` spinner
 * branch, so finding it is the same event stated in terms of the DOM.
 */
export const loaded = () => screen.findByTestId("file-actions");

export function setApiResponses(file: FileItem) {
  (api.getFile as ReturnType<typeof vi.fn>).mockResolvedValue(file);
  (api.recordFileView as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
}

/**
 * Set the viewport width. Defaults to a desktop one.
 *
 * jsdom reports 1024px, which is under the inspector's default-open
 * threshold, so a file that rides the shell renders with the inspector
 * collapsed — and the action row, the title and the tags live in the
 * inspector now. A suite asserting on any of them is asserting about a
 * desktop reader, so it has to be at a desktop width; otherwise it is
 * testing the collapsed state and calling it the layout. Pass a phone
 * width to test the other side of that.
 *
 * Call before `render`. `notifyViewportChange` is for anything already
 * mounted, since the store derives the default at read time.
 */
export function setViewport(width = 1400) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  inspectorOpenStore.notifyViewportChange();
}
