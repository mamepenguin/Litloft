import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { FileActions, MENU_GAP_PX } from "@/components/FileActions";
import { SHEET_PEEK_PX } from "@/lib/sheetSnap";
import {
  MobileInspectorSheet,
  SHEET_PEEK_HEIGHT,
  SHEET_STATE_PEEK,
} from "@/components/MobileInspectorSheet";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { deleteFile } from "@/lib/api";
import type { FileItem } from "@/types";

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
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  moveFile: vi.fn().mockResolvedValue({}),
  renameFile: vi.fn().mockResolvedValue({}),
  getFolders: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>Confirm</button> : null,
}));

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const FIXTURE_HTML = readFileSync(
  resolve(REPO_ROOT, "frontend/e2e-layout/fixtures/file-actions-menu.html"),
  "utf-8",
);

const SPEC: Record<string, string | number> = JSON.parse(
  FIXTURE_HTML.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const mockFile: FileItem = {
  image_width: null,
  image_height: null,
  id: "file-1",
  filename: "test.mp4",
  title: "Test",
  description: "",
  drive: "main",
  folder_path: "videos",
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
};

const tokens = (className: string) =>
  new Set(className.split(/\s+/).filter(Boolean));

/** Sorted before comparing: the order utilities are written in is not a property of anything. */
const sorted = (set: Set<string>) => [...set].sort();

const str = (key: string) => SPEC[key] as string;

function expectComposedOf(rendered: string, parts: string[]) {
  const expected = new Set<string>();
  for (const part of parts) for (const token of tokens(part)) expected.add(token);
  expect(sorted(tokens(rendered))).toEqual(sorted(expected));
}

function openAt(state: { up: boolean; left: boolean }) {
  const trigger = state.up
    ? { top: 712, bottom: 748 }
    : { top: 100, bottom: 128 };
  const right = state.left ? 150 : 328;
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if ((this as HTMLElement).classList.contains("relative")) {
        return { ...trigger, left: right - 28, right } as DOMRect;
      }
      if (this.getAttribute("role") === "menu") {
        // The width is needed too: the side is chosen against it. 160 is
        // what `w-40` draws at.
        return { height: 200, width: 160 } as DOMRect;
      }
      return original.call(this);
    },
  );

  const { container } = render(
    <ShortcutsProvider>
      <FileActions file={mockFile} />
    </ShortcutsProvider>,
  );
  fireEvent.click(screen.getByLabelText("File actions"));
  return container;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(deleteFile).mockResolvedValue(undefined);
});

describe("the file-actions layout fixture's class lists", () => {
  it("declares the wrapper and the trigger the component renders", () => {
    openAt({ up: false, left: false });
    const button = screen.getByLabelText("File actions");
    expect(sorted(tokens(button.className))).toEqual(
      sorted(tokens(str("trigger"))),
    );
    expect(sorted(tokens(button.parentElement!.className))).toEqual(
      sorted(tokens(str("wrapper"))),
    );
  });

  it("declares a menu row the component renders", () => {
    openAt({ up: false, left: false });
    const row = screen.getAllByRole("menuitem")[0]!;
    expect(row.className).not.toContain("text-danger");
    expect(row).not.toHaveAttribute("aria-pressed", "true");
    expect(sorted(tokens(row.className))).toEqual(
      sorted(tokens(str("menuItem"))),
    );
  });

  const VERTICAL = ["down", "up"] as const;
  const HORIZONTAL = ["right", "left"] as const;
  const CORNERS = VERTICAL.flatMap((up) =>
    HORIZONTAL.map((left) => ({ up, left })),
  );

  const comparedCorners: string[] = [];
  const comparedToasts: string[] = [];
  const cornerId = (up: string, left: string) => `${up}/${left}`;

  const registeredCase = (
    record: string[],
    id: string,
    title: string,
    body: () => void | Promise<void>,
  ) => {
    record.push(id);
    it(title, body);
  };

  it("compares exactly the corners the fixture declares, on both boxes", () => {
    expect([...VERTICAL, ...HORIZONTAL].sort()).toEqual(
      ["down", "left", "right", "up"].sort(),
    );
    expect(comparedCorners).toEqual(
      VERTICAL.flatMap((up) => HORIZONTAL.map((left) => cornerId(up, left))),
    );
    expect(new Set(comparedToasts.map((id) => id.split("/")[0]))).toEqual(
      new Set(VERTICAL),
    );
    expect(new Set(comparedToasts.map((id) => id.split("/")[1]))).toEqual(
      new Set(HORIZONTAL),
    );
  });

  for (const corner of CORNERS) {
    registeredCase(
      comparedCorners,
      cornerId(corner.up, corner.left),
      `declares the menu's ${corner.up} / ${corner.left} class list`,
      () => {
        openAt({ up: corner.up === "up", left: corner.left === "left" });
        expectComposedOf(screen.getByRole("menu").className, [
          str("menuBase"),
          str(corner.up),
          str(corner.left),
        ]);
      },
    );
  }

  const TOASTS = [
    { up: true, left: true },
    { up: false, left: false },
  ];

  for (const corner of TOASTS) {
    registeredCase(
      comparedToasts,
      cornerId(corner.up ? "up" : "down", corner.left ? "left" : "right"),
      `declares the toast's ${corner.up ? "upward" : "downward"} / ${
        corner.left ? "left" : "right"
      } class list`,
      async () => {
        vi.mocked(deleteFile).mockRejectedValue(new Error("nope"));
        openAt(corner);
        fireEvent.click(screen.getByText("Move to Trash"));
        fireEvent.click(screen.getByText("Confirm"));

        const toast = await screen.findByText("Failed to delete");
        expectComposedOf(toast.className, [
          str("toastBase"),
          str(corner.up ? "up" : "down"),
          str(corner.left ? "left" : "right"),
        ]);
      },
    );
  }

  it("declares the resting strip the spec puts the trigger inside", () => {
    render(
      <MobileInspectorSheet
        state={SHEET_STATE_PEEK}
        onStateChange={vi.fn()}
        peek={null}
      >
        {null}
      </MobileInspectorSheet>,
    );
    const strip = screen.getByTestId("mobile-inspector-peek");
    expect(sorted(tokens(strip.className))).toEqual(
      sorted(tokens(str("strip"))),
    );
    expect(SPEC.stripHeight).toBe(SHEET_PEEK_HEIGHT);
    expect(strip.getAttribute("style")).toMatch(
      new RegExp(`height:\\s*calc\\(${SHEET_PEEK_PX}px \\+ env\\(`),
    );
  });

  it("declares the gap the component adds to the menu's height", () => {
    expect(SPEC.gapPx).toBe(MENU_GAP_PX);
  });

  it("declares every key the fixture uses, and no others", () => {
    expect(Object.keys(SPEC).sort()).toEqual([
      "down",
      "gapPx",
      "left",
      "menuBase",
      "menuItem",
      "right",
      "strip",
      "stripHeight",
      "toastBase",
      "trigger",
      "up",
      "wrapper",
    ]);
  });
});
