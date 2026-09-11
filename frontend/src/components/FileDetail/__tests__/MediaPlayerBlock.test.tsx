/**
 * Which box each thing under the player lives in.
 *
 * `.media-detail-player` is not "the top of the page": it is the playable
 * surface the reader must keep whole. The Bottom Sheet's `half` is solved
 * against its bottom edge, `--player-avail` caps its width, and on a
 * phone the stylesheet sticks it to the top of the canvas. So what is
 * inside it and what is merely near it are different claims, and this is
 * where they are separated.
 *
 * The defect it exists for: the `loft-metadata` panel — a channel name, a
 * date, three lines of description — was rendered inside that box, which
 * put `half` 80px below a `.loft` video's bottom edge and nowhere else
 * (measured at 393x727). Nothing failed, because no test asked which box
 * anything was in.
 *
 * jsdom lays nothing out, so the 80px is not re-measured here. What is
 * held is the containment that produced it.
 */

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

function renderBlock(file: FileItem) {
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
    block: container.querySelector(".media-detail-player-block")!,
    player: container.querySelector(".media-detail-player")!,
    aside: container.querySelector("[data-slot='loft-metadata']"),
  };
}

describe("the player block", () => {
  it("keeps the provider metadata out of the playable surface", () => {
    const { block, player, aside } = renderBlock(makeFile(LOFT));

    expect(aside).not.toBeNull();
    expect(player.contains(aside)).toBe(false);
    expect(block.contains(aside!)).toBe(true);
  });

  it("takes the grid area on the block, so the aside has a cell", () => {
    // The legacy layout is a grid of named areas, and a child with no
    // area is auto-placed into whichever cell happens to be free. The
    // area therefore belongs to the box that holds both.
    const { block, player } = renderBlock(makeFile(LOFT));

    expect(block.className).toContain("media-detail-player-block");
    expect(player.className.split(/\s+/)).not.toContain(
      "media-detail-player-block",
    );
    expect(block.contains(player)).toBe(true);
  });

  it("does not ask for provider metadata about a file that has none", () => {
    // The panel fetches as soon as it mounts, so mounting it for every
    // media file would be a request per file with nothing to answer it.
    expect(renderBlock(makeFile()).aside).toBeNull();
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
