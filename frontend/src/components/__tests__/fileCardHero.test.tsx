import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileCard } from "../FileCard";
import { JustifiedFileCell } from "../JustifiedFileCell";
import { FileListRow } from "../FileListRow";
import type { FileItem } from "@/types";

const around = vi.hoisted(() => vi.fn());

vi.mock("@/lib/viewTransitions", () => ({
  navigateWithTransition: vi.fn(),
  transitionAroundNavigation: around,
}));

vi.mock("next/link", () => ({
  default: ({ children, onNavigate, ...rest }: Record<string, unknown> & {
    children: React.ReactNode;
    onNavigate?: () => void;
  }) => (
    <a
      {...(rest as Record<string, unknown>)}
      onClick={(e) => {
        (rest.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e);
        onNavigate?.();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

vi.mock("@/lib/fileNavigationOverride", () => ({
  useFileNavigationOverride: () => null,
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), isCut: () => false }),
}));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), isCut: () => false }),
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

beforeEach(() => around.mockClear());

/**
 * The transition needs the picture that was pressed. A card that hands it
 * nothing leaves the flight with no first frame to show.
 */
describe("every listing card offers the picture it was opened from", () => {
  const cases: [string, () => void][] = [
    ["FileCard", () => render(<FileCard file={file} />)],
    [
      "JustifiedFileCell",
      () =>
        render(
          <JustifiedFileCell file={file} />,
        ),
    ],
    ["FileListRow", () => render(<FileListRow file={file} />)],
  ];

  for (const [name, mount] of cases) {
    it(`${name} names the pressed picture`, () => {
      mount();
      fireEvent.click(screen.getAllByRole("link")[0]);

      expect(around).toHaveBeenCalledWith("file-open", {
        hero: expect.any(HTMLElement),
      });
    });
  }
});
