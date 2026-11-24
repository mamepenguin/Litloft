/**
 * SPEC-CORE-150 rule 1: a caller's leading rows in the shared file menu, through
 * `FileContextMenu`, `CarouselSection` and both layouts of `FileGrid`.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Ban, Star } from "lucide-react";
import type { ReactNode } from "react";

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
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
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
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
  deleteFile: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
}));

vi.mock("@/hooks/useShortcuts", () => ({
  useShortcuts: () => {},
}));

const toastCalls = vi.fn();
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    success: (...a: unknown[]) => toastCalls("success", ...a),
    error: (...a: unknown[]) => toastCalls("error", ...a),
    info: (...a: unknown[]) => toastCalls("info", ...a),
  }),
}));

import { FileContextMenu } from "../FileContextMenu";
import { CarouselSection } from "../CarouselSection";
import { FileGrid } from "../FileGrid";
import type { FileItem } from "@/types";

const makeFile = (overrides: Partial<FileItem> = {}): FileItem =>
  ({
    image_width: null,
    image_height: null,
    id: "abcdefghijkl",
    filename: "clip.mp4",
    title: "Clip",
    description: "",
    drive: "videos",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 10,
    duration: 60,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    modified_at: null,
    ...overrides,
  }) as FileItem;

type ExtraRow = { id: string; label: string; icon: typeof Ban; onSelect: () => unknown; disabled?: boolean };

function extras(onSelect: () => unknown = vi.fn(), disabled = false): ExtraRow[] {
  return [
    { id: "not-interested", label: "Not interested", icon: Ban, onSelect, disabled },
    { id: "second", label: "Second extra", icon: Star, onSelect: vi.fn() },
  ];
}

/** The menu's children in order: a row by its label, anything else as DIVIDER. */
function menuShape(): string[] {
  const first = screen.getAllByRole("menuitem")[0];
  const menu = first.parentElement!;
  return [...menu.children].map((el) =>
    el.getAttribute("role") === "menuitem" ? (el.textContent ?? "").trim() : "DIVIDER",
  );
}

const DIVIDER = "DIVIDER";

function fileMenu(extraMenuItems?: (file: FileItem) => ExtraRow[], onClose = vi.fn()) {
  const props = {
    open: true,
    position: { x: 10, y: 10 },
    target: makeFile(),
    onClose,
    onUpdate: vi.fn(),
    ...(extraMenuItems ? { extraMenuItems } : {}),
  } as unknown as React.ComponentProps<typeof FileContextMenu>;
  return render(<FileContextMenu {...props} />);
}

beforeEach(() => {
  toastCalls.mockReset();
});

describe("SPEC-CORE-150 rule 1 the extra group in FileContextMenu", () => {
  it("SPEC-CORE-150 I6 D1 the extra rows come first, then one divider, then exactly today's rows; without them, no divider", () => {
    fileMenu();
    const today = menuShape();
    cleanup();
    expect(today).not.toContain(DIVIDER);

    const asked = vi.fn((_file: FileItem) => extras());
    fileMenu(asked);

    expect(menuShape()).toEqual(["Not interested", "Second extra", DIVIDER, ...today]);
    expect(asked).toHaveBeenCalled();
    expect(asked.mock.calls[0][0]).toMatchObject({ id: "abcdefghijkl" });
  });

  it("SPEC-CORE-150 rule 1 D4 choosing a row calls onSelect once and closes the menu without waiting on it or toasting", async () => {
    const onSelect = vi.fn(() => new Promise<never>(() => {}));
    const onClose = vi.fn();
    fileMenu(() => extras(onSelect), onClose);

    const row = screen.getByRole("menuitem", { name: "Not interested" });
    await act(async () => {
      fireEvent.pointerDown(row);
      fireEvent.click(row);
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastCalls).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-150 rule 1 D4 a disabled row is drawn disabled, keeps the menu's rows, and does not run", () => {
    fileMenu();
    const today = menuShape();
    cleanup();

    const onSelect = vi.fn();
    fileMenu(() => extras(onSelect, true));
    const row = screen.getByRole("menuitem", { name: "Not interested" });
    fireEvent.click(row);

    expect(row).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(menuShape()).toEqual(["Not interested", "Second extra", DIVIDER, ...today]);
  });
});

/** The cell's first leaf, so the event bubbles through whatever element listens for it. */
function deepest(el: HTMLElement): HTMLElement {
  let node = el;
  while (node.firstElementChild) node = node.firstElementChild as HTMLElement;
  return node;
}

function rightClickTitle(text: string) {
  fireEvent.contextMenu(screen.getAllByText(text)[0]);
}

describe("SPEC-CORE-150 rule 1 the extra group through the card surfaces", () => {
  function baseline(ui: React.ReactElement, text: string): string[] {
    render(ui);
    rightClickTitle(text);
    const out = menuShape();
    cleanup();
    return out;
  }

  it("SPEC-CORE-150 I6 FileGrid's equal cards pass extraMenuItems through", () => {
    const files = [makeFile()];
    const today = baseline(<FileGrid files={files} />, "Clip");
    expect(today).not.toContain(DIVIDER);

    const props = { files, extraMenuItems: () => extras() } as unknown as React.ComponentProps<typeof FileGrid>;
    render(<FileGrid {...props} />);
    rightClickTitle("Clip");

    expect(menuShape()).toEqual(["Not interested", "Second extra", DIVIDER, ...today]);
  });

  it("SPEC-CORE-150 I6 FileGrid's justified rows pass extraMenuItems through", () => {
    const photos = Array.from({ length: 20 }, (_, i) =>
      makeFile({
        id: `p${String(i).padStart(11, "0")}`,
        title: `Photo ${i}`,
        filename: `shot-${i}.jpg`,
        file_type: "image",
        mime_type: "image/jpeg",
        duration: null,
        image_width: 3000,
        image_height: 4000,
      }),
    );
    const { container } = render(<FileGrid files={photos} />);
    expect(container.querySelector(".justified-grid")).not.toBeNull();
    fireEvent.contextMenu(deepest(container.querySelector(".justified-grid-cell") as HTMLElement));
    const today = menuShape();
    cleanup();
    expect(today).not.toContain(DIVIDER);

    const asked = vi.fn((_file: FileItem) => extras());
    const props = { files: photos, extraMenuItems: asked } as unknown as React.ComponentProps<typeof FileGrid>;
    const view = render(<FileGrid {...props} />);
    fireEvent.contextMenu(deepest(view.container.querySelector(".justified-grid-cell") as HTMLElement));

    expect(menuShape()).toEqual(["Not interested", "Second extra", DIVIDER, ...today]);
    expect(asked.mock.calls[0][0]).toMatchObject({ id: photos[0].id });
  });

  it("SPEC-CORE-150 I6 CarouselSection passes extraMenuItems through", () => {
    const files = [makeFile()];
    const base = { title: "Pickup", icon: null, files, loading: false };
    const today = baseline(<CarouselSection {...(base as unknown as React.ComponentProps<typeof CarouselSection>)} />, "Clip");
    expect(today).not.toContain(DIVIDER);

    const props = { ...base, extraMenuItems: () => extras() } as unknown as React.ComponentProps<typeof CarouselSection>;
    render(<CarouselSection {...props} />);
    rightClickTitle("Clip");

    expect(menuShape()).toEqual(["Not interested", "Second extra", DIVIDER, ...today]);
  });
});
