import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileCard } from "../FileCard";
import { JustifiedFileCell } from "../JustifiedFileCell";
import { FileListRow } from "../FileListRow";
import type { FileItem } from "@/types";

const ghost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openGhost", () => ({ showOpenGhost: ghost }));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

vi.mock("@/lib/fileNavigationOverride", () => ({
  useFileNavigationOverride: () => null,
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    clear: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    clear: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    isCut: () => false,
  }),
}));

const file = {
  id: "f1",
  title: "photo",
  filename: "photo.jpg",
  drive: "main",
  folder_path: "",
  file_type: "image",
  mime_type: "image/jpeg",
  has_thumbnail: true,
  image_width: 4032,
  image_height: 3024,
  tags: [],
} as unknown as FileItem;

beforeEach(() => ghost.mockClear());

/**
 * The ghost is a copy of something, so a card that hands it nothing shows
 * nothing. A fixture passing the element in cannot notice that.
 */
describe("every listing card offers the picture it was opened from", () => {
  const cases: [string, () => void][] = [
    ["FileCard", () => render(<FileCard file={file} />)],
    ["JustifiedFileCell", () => render(<JustifiedFileCell file={file} />)],
    ["FileListRow", () => render(<FileListRow file={file} />)],
  ];

  for (const [name, mount] of cases) {
    it(`${name} hands over its own picture`, () => {
      mount();

      fireEvent.click(screen.getAllByRole("link")[0]);

      expect(ghost).toHaveBeenCalledOnce();
      const handed = ghost.mock.calls[0][0] as HTMLElement | null;
      expect(handed).toBeInstanceOf(HTMLElement);
      expect(handed).toHaveAttribute("data-file-thumb");
    });
  }
});
