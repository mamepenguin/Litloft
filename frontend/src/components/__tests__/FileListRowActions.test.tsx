/**
 * The list row's overflow button.
 *
 * Rename, move, copy, cut, add-to-collection and trash used to be
 * reachable from a list row only by right-clicking it, so a keyboard
 * could not reach them at all — the row's own link was the only
 * focusable thing in it.
 *
 * The rules it follows are the ones `MatchOverlay` already established
 * for a repeated icon-only control, plus the hit-area and naming
 * requirements from hako `Prwd_iaXmCjWfY24KjFz2`.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/lib/api", () => ({
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

import { FileListRow } from "../FileListRow";
import type { FileItemWithMatch } from "@/types";

const file = {
  id: "f1",
  filename: "quarterly-report.pdf",
  title: "Quarterly report",
  description: "",
  drive: "work",
  folder_path: "",
  file_type: "document",
  mime_type: "application/pdf",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024,
  duration: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as unknown as FileItemWithMatch;

const actions = () => screen.queryByRole("button", { name: /Actions for/i });

describe("the list row's overflow button", () => {
  it("names the file it belongs to", () => {
    // A list of buttons all called "Actions" tells a screen reader
    // nothing about which row it is on.
    render(<FileListRow file={file} onContextMenu={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Actions for Quarterly report" }),
    ).toBeInTheDocument();
  });

  it("is reachable and operable from the keyboard", () => {
    const onContextMenu = vi.fn();
    render(<FileListRow file={file} onContextMenu={onContextMenu} />);

    const button = actions()!;
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("opens the menu at the row, not at the corner of the window", () => {
    // Enter and Space on a button produce a click carrying no pointer,
    // so the raw event says (0, 0) and the menu clamps to the top-left
    // of the viewport — forty rows away from the row it belongs to.
    const onContextMenu = vi.fn();
    render(<FileListRow file={file} onContextMenu={onContextMenu} />);

    const button = actions()!;
    button.getBoundingClientRect = () =>
      ({ left: 812, bottom: 344, top: 320, right: 836, width: 24, height: 24, x: 812, y: 320, toJSON() {} }) as DOMRect;

    // A coordinate-free click is what the keyboard produces.
    fireEvent.click(button, { clientX: 0, clientY: 0 });

    const event = onContextMenu.mock.calls[0][0] as React.MouseEvent;
    expect(event.clientX).toBe(812);
    expect(event.clientY).toBe(344);
  });

  it("leaves a real pointer click where the pointer was", () => {
    const onContextMenu = vi.fn();
    render(<FileListRow file={file} onContextMenu={onContextMenu} />);

    fireEvent.click(actions()!, { clientX: 400, clientY: 260 });

    const event = onContextMenu.mock.calls[0][0] as React.MouseEvent;
    expect(event.clientX).toBe(400);
    expect(event.clientY).toBe(260);
  });

  it("holds its place instead of appearing, so the row does not reflow", () => {
    render(<FileListRow file={file} onContextMenu={vi.fn()} />);
    const cls = actions()!.className;
    // Present but transparent, revealed by hover and by focus.
    expect(cls).toContain("opacity-0");
    expect(cls).toContain("group-hover:opacity-100");
    expect(cls).toContain("focus-visible:opacity-100");
  });

  it("stays visible where there is no hover to reveal it", () => {
    render(<FileListRow file={file} onContextMenu={vi.fn()} />);
    expect(actions()!.className).toContain("pointer-coarse:opacity-100");
  });

  it("is a target a finger can hit, not just its glyph", () => {
    render(<FileListRow file={file} onContextMenu={vi.fn()} />);
    const cls = actions()!.className;
    // 24px around a 16px icon, 44px where the pointer is coarse.
    expect(cls).toContain("h-6");
    expect(cls).toContain("w-6");
    expect(cls).toContain("pointer-coarse:h-11");
    expect(cls).toContain("pointer-coarse:w-11");
  });

  it("gives the star the file's name too", () => {
    render(
      <FileListRow file={file} onContextMenu={vi.fn()} onFavoriteToggle={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /Quarterly report to favorites/i }),
    ).toBeInTheDocument();
  });

  it("stands down in selection mode, where the row means 'pick me'", () => {
    // Right-click is already disabled there for the same reason.
    render(<FileListRow file={file} onContextMenu={vi.fn()} selectable />);
    expect(actions()).toBeNull();
  });

  it("is absent where the host wires no menu", () => {
    render(<FileListRow file={file} />);
    expect(actions()).toBeNull();
  });
});
