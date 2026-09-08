/**
 * The layout fixture's class lists, against the components it copies.
 *
 * `e2e-layout/file-actions-menu.spec.ts` measures where a `top-full` box
 * and a `bottom-full` box actually land on a phone, and it can only
 * measure the markup in front of it — markup that file writes itself. Take
 * the whole measurement out of `FileActions` and hard-code `top-full` and
 * every case there stays green, because the fixture never asked the
 * component anything.
 *
 * This is what asks. The four states of the menu and the two of the toast
 * are rendered from the real component and compared with the fixture's
 * declarations, whole and in both directions: a class dropped from either
 * side is red. `FileActions.test.tsx` drives the decision that picks
 * between those states; this file only pins that the states are the ones
 * the fixture is measuring.
 *
 * jsdom lays nothing out, so nothing here is evidence about a position.
 * That is the browser spec's, and this is what connects the two.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { FileActions } from "@/components/FileActions";
import {
  MobileInspectorSheet,
  SHEET_PEEK_PX,
  SHEET_SNAP_PEEK,
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

/**
 * Sorted before comparing: the order utilities are written in is not a
 * property of anything, and pinning it would make a reorder red for no
 * reason. Which utilities are present is the property.
 */
const sorted = (set: Set<string>) => [...set].sort();

const str = (key: string) => SPEC[key] as string;

/**
 * The fixture builds a popup's class list as `base` plus one token group
 * per axis, so the component's whole class list has to be exactly that
 * union — no leftovers on either side.
 */
function expectComposedOf(rendered: string, parts: string[]) {
  const expected = new Set<string>();
  for (const part of parts) for (const token of tokens(part)) expected.add(token);
  expect(sorted(tokens(rendered))).toEqual(sorted(expected));
}

/**
 * Opens the menu with the trigger and the menu box stated, so the
 * component resolves to the requested corner. The rects are the same
 * stated shape `FileActions.test.tsx` uses and mean nothing geometric.
 */
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
        return { height: 200 } as DOMRect;
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
    // The first row, which is neither `danger` nor `active` — the two
    // variants `ActionMenuItem` also has, and neither of which the
    // fixture's uniform rows are. A menu whose first row became one would
    // be a different height and the spec's numbers would be about it.
    const row = screen.getAllByRole("menuitem")[0]!;
    expect(row.className).not.toContain("text-danger");
    expect(row).not.toHaveAttribute("aria-pressed", "true");
    expect(sorted(tokens(row.className))).toEqual(
      sorted(tokens(str("menuItem"))),
    );
  });

  // All four corners, declared one by one rather than derived from what
  // the component happened to render: a table built out of the rendered
  // strings would stay green with a corner deleted from both sides.
  const CORNERS: { up: boolean; left: boolean }[] = [
    { up: false, left: false },
    { up: false, left: true },
    { up: true, left: false },
    { up: true, left: true },
  ];

  for (const corner of CORNERS) {
    it(`declares the menu's ${corner.up ? "upward" : "downward"} / ${
      corner.left ? "left" : "right"
    } class list`, () => {
      openAt(corner);
      expectComposedOf(screen.getByRole("menu").className, [
        str("menuBase"),
        str(corner.up ? "up" : "down"),
        str(corner.left ? "left" : "right"),
      ]);
    });
  }

  // The toast's two, driven through a rejected delete so it is the real
  // one. Two rather than four because the toast reuses the menu's flags:
  // one corner per axis is what shows it follows both.
  const TOASTS = [
    { up: true, left: true },
    { up: false, left: false },
  ];

  for (const corner of TOASTS) {
    it(`declares the toast's ${corner.up ? "upward" : "downward"} / ${
      corner.left ? "left" : "right"
    } class list`, async () => {
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
    });
  }

  it("declares the resting strip the spec puts the trigger inside", () => {
    // The strip is the reason there is nothing below the trigger, so the
    // fixture drawing a different box would measure a different claim.
    // Its height is a number rather than a class, so it is pinned against
    // the constant the sheet renders from.
    render(
      <MobileInspectorSheet
        snap={SHEET_SNAP_PEEK}
        onSnapChange={vi.fn()}
        peek={null}
      >
        {null}
      </MobileInspectorSheet>,
    );
    const strip = screen.getByTestId("mobile-inspector-peek");
    expect(sorted(tokens(strip.className))).toEqual(
      sorted(tokens(str("strip"))),
    );
    expect(SPEC.stripHeightPx).toBe(SHEET_PEEK_PX);
    expect(strip.style.height).toBe(`${SHEET_PEEK_PX}px`);
  });

  it("declares every key the fixture uses, and no others", () => {
    // The fixture's builders index `SPEC` by name, so a key removed here
    // and there together would leave both halves agreeing about nothing.
    expect(Object.keys(SPEC).sort()).toEqual([
      "down",
      "left",
      "menuBase",
      "menuItem",
      "right",
      "strip",
      "stripHeightPx",
      "toastBase",
      "trigger",
      "up",
      "wrapper",
    ]);
  });
});
