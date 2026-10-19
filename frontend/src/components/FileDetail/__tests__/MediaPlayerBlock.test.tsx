import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";

import type { FileItem } from "@/types";
import { MediaPlayerBlock } from "../MediaPlayerBlock";

vi.mock("../../FilePreview", () => ({
  FilePreview: () => <div data-testid="file-preview" />,
}));

vi.mock("../../AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) => <div data-slot={id} />,
}));

vi.mock("../../MediaLayoutToggle", () => ({
  MediaLayoutToggle: () => <button type="button">layout</button>,
}));

const filled = new Set<string>();

vi.mock("../../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ hasSlot: (id: string) => filled.has(id) }),
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
    id: "file-1",
    filename: "clip.mp4",
    title: "Clip",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1000,
    duration: 60,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const LOFT = {
  filename: "watch.loft",
  mime_type: "application/vnd.litloft.loft+json",
};

function renderBlock(file: FileItem, slots: string[] = ["loft-metadata"]) {
  filled.clear();
  for (const id of slots) filled.add(id);
  const { container } = render(
    <MediaPlayerBlock
      file={file}
      videoRef={createRef<HTMLVideoElement>()}
      onMediaController={vi.fn()}
      onDocumentCaptureController={vi.fn()}
      markdownReloadKey={0}
      onMarkdownTagsSaved={vi.fn()}
      addonSlotProps={{}}
      playerWrapperRef={createRef<HTMLDivElement>()}
      framed
      layoutToggle={null}
    />,
  );
  return {
    container,
    player: container.querySelector(".media-detail-player")!,
    aside: container.querySelector(".media-detail-player-aside"),
    slot: container.querySelector("[data-slot='loft-metadata']"),
  };
}

describe("the player block", () => {
  it("keeps the provider metadata out of the playable surface", () => {
    const { player, aside, slot } = renderBlock(makeFile(LOFT));

    expect(slot).not.toBeNull();
    expect(player.contains(slot)).toBe(false);
    expect(aside!.contains(slot!)).toBe(true);
  });

  it("draws it as the player's sibling, and never as a box around it", () => {
    // `position: sticky` travels only inside its own containing block, so
    // a wrapper drawn around the player to hold both boxes has the
    // player's own height and leaves it no travel at all — the phone's
    // pinned player scrolls off the top instead.
    const { container, player, aside } = renderBlock(makeFile(LOFT));

    expect(player.parentElement).toBe(container);
    expect(aside!.parentElement).toBe(container);
    expect(aside!.contains(player)).toBe(false);
    // And it is the box `globals.css` gives a grid area of its own, so
    // the legacy grid does not auto-place it into someone else's cell.
    expect(aside!.className).toContain("media-detail-player-aside");
  });

  /**
   * An occupant that renders nothing is not in this table: it leaves the
   * box in the document, and what takes it out of the layout is
   * `empty:hidden`.
   */
  const ABSENT = [
    { name: "a local file, with the slot filled", loft: false, filled: true },
    {
      name: "a provider file, with nothing registered to fill it",
      loft: true,
      filled: false,
    },
    { name: "neither", loft: false, filled: false },
  ];

  it("declares every reason this file decides the box is not drawn", () => {
    expect(ABSENT).toHaveLength(3);
    expect(new Set(ABSENT.map((a) => `${a.loft}${a.filled}`)).size).toBe(3);
  });

  describe.each(ABSENT)("draws no box for $name", ({ loft, filled: full }) => {
    it("neither the box nor the slot", () => {
      const { aside, slot } = renderBlock(
        makeFile(loft ? LOFT : {}),
        full ? ["loft-metadata"] : [],
      );
      expect(aside).toBeNull();
      expect(slot).toBeNull();
    });
  });

  it("hides the box itself when its occupant drew nothing", () => {
    // The occupant decides at render time and has reasons that are not
    // failures — the Media Import panel draws nothing for a `.loft` file
    // whose provider metadata has not been fetched.
    const { aside } = renderBlock(makeFile(LOFT));
    expect(aside!.className.split(/\s+/)).toContain("empty:hidden");
  });

  it("keeps the core action row inside the playable surface", () => {
    // The other direction, and it is deliberate: those controls act on
    // the thing being played, so they are as worth keeping on screen as
    // the picture (`useSheetHalfSnap`). Only *content* moves out.
    const { player } = renderBlock(makeFile(LOFT));
    const row = player.querySelector("[data-slot='file-preview-actions']");
    expect(row).not.toBeNull();
  });
});
