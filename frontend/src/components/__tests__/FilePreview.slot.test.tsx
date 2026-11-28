import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import { FilePreview } from "../FilePreview";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getPreviewTextUrl: (id: string) => `/api/files/${id}/preview-text`,
}));

vi.mock("../VideoPlayer", () => ({
  VideoPlayer: ({ videoId, posterUrl }: { videoId: string; posterUrl?: string }) => (
    <div data-testid="video-player" data-id={videoId} data-poster={posterUrl ?? ""} />
  ),
}));

vi.mock("../loft/LoftPlayer", () => ({
  default: ({ fileId, posterUrl }: { fileId: string; posterUrl?: string }) => (
    <div data-testid="loft-player" data-id={fileId} data-poster={posterUrl ?? ""} />
  ),
}));

vi.mock("../AddonSlot", () => ({
  AddonSlot: () => null,
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
    id: "file-1",
    filename: "test.mp4",
    title: "Test",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
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
    modified_at: null,
    ...overrides,
  };
}

describe("SPEC-CORE-194 I9: where no layer is mounted the slot renders the player in place", () => {
  it.each([
    ["video-player", {}],
    ["loft-player", { mime_type: "application/vnd.litloft.loft+json", filename: "clip.loft" }],
  ] as const)("renders %s as the only child of the slot, with the file's id and poster", (testId, kind) => {
    const { container } = render(<FilePreview file={makeFile(kind)} />);
    const slots = container.querySelectorAll("[data-player-slot]");
    expect(slots).toHaveLength(1);
    const slot = slots[0];
    expect(slot.children).toHaveLength(1);
    const player = slot.children[0] as HTMLElement;
    expect(player.dataset.testid).toBe(testId);
    expect(player.dataset.id).toBe("file-1");
    expect(player.dataset.poster).toBe("/api/files/file-1/thumbnail");
  });

});
