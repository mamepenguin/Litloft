/**
 * The Enlarge panels button in the workbench row on the canonical file page:
 * where it is drawn, the remembered `workbench-player-focus` value it
 * toggles, and the player share that value hands the canvas.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import {
  claimSlot,
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  loaded,
  shellLoaded,
  slotMocks,
  usePolicyMock,
} from "./harness";
import {
  NARROW_ROW,
  SCENES,
  STORE_KEY,
  TRANSCRIPT,
  WIDE_ROW,
  fit,
  installRow,
  panelGroup,
  resizeRowTo,
  shownPanels,
  storeOpen,
  storePanels,
  toggle,
} from "./workbenchHelpers";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../FilePreview", async () => ({
  FilePreview: (await import("./harness")).FilePreviewStub,
}));
vi.mock("../../ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("./harness")).ActiveSummaryHostStub,
}));
vi.mock("../related/RelatedPanel", async () => ({
  RelatedPanel: (await import("./harness")).RelatedPanelStub,
}));
vi.mock("../related/useFileRelations", async () => ({
  useFileRelations: (await import("./harness")).useFileRelationsStub,
}));
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("./harness")).useAddonSlotsStub,
}));
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("./harness")).usePolicyMock,
}));
vi.mock("../../CommentSection", async () => ({
  CommentSection: (await import("./harness")).CommentSectionStub,
}));
vi.mock("../../EditableTagChips", async () => ({
  EditableTagChips: (await import("./harness")).EditableTagChipsStub,
}));
vi.mock("../../FavoriteButton", async () => ({
  FavoriteButton: (await import("./harness")).FavoriteButtonStub,
}));
vi.mock("../../FileActions", async () => ({
  FileActions: (await import("./harness")).FileActionsStub,
}));
vi.mock("../../CastButton", async () => ({
  CastButton: (await import("./harness")).CastButtonStub,
}));
vi.mock("../../ChaptersPanel", async () => ({
  ChaptersPanel: (await import("./harness")).ChaptersPanelStub,
}));
const apiMocks = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@/lib/api", () => ({
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));
vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
}));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const FOCUS_KEY = "workbench-player-focus";
const NAME = "Enlarge panels";
const FOCUSED_SHARE = "0.3";
const DEFAULT_SHARE = "0.5";

const VIDEO = makeFile({ has_chapters: true });
const LOFT = makeFile({ filename: "clip.loft", mime_type: "application/x-loft" });
const AUDIO = makeFile({
  filename: "ep.mp3",
  file_type: "audio",
  mime_type: "audio/mpeg",
  has_chapters: false,
});

function resetHarness() {
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  slotMocks.occupied.clear();
  slotMocks.entries.clear();
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHarness();
  window.localStorage.clear();
});

/** Unmounts and drops the window's spies, keeping localStorage, so a second page can be drawn in the same test. */
function drawAgain() {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetHarness();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Form = "beside" | "stacked-closed" | "stacked-open" | "phone";

/** Sets up the window for a form; the form is checked against `fit()` after render. */
function arrange(form: Form) {
  switch (form) {
    case "beside":
      setViewport(1400);
      installRow(WIDE_ROW);
      storeOpen(true);
      return;
    case "stacked-closed":
      setViewport(1024);
      installRow(NARROW_ROW);
      storeOpen(false);
      return;
    case "stacked-open":
      setViewport(1024);
      installRow(NARROW_ROW);
      storeOpen(true);
      return;
    case "phone":
      setViewport(400);
      installRow(360);
      return;
  }
}

async function renderFile(
  file: FileItem = VIDEO,
  { surface }: { surface?: "collection" } = {},
) {
  setApiResponses(file);
  const utils = render(
    <FileDetailContent fileId={file.id} drive="main" surface={surface} />,
  );
  // The collection surface's inspector starts open and has no measured form to wait on.
  if (surface === "collection") await loaded();
  else {
    await shellLoaded();
    await waitFor(() => expect(fit()).not.toBeUndefined());
  }
  return utils;
}

const buttons = () => screen.queryAllByRole("button", { name: NAME });

function enlarge(): HTMLElement {
  const found = buttons();
  if (found.length !== 1) {
    throw new Error(`expected one ${NAME} button, found ${found.length}`);
  }
  return found[0];
}

function press() {
  fireEvent.click(enlarge());
}

/** The share the canvas hands the player cap, read where the page sets it. */
function playerShare(): string | null {
  const values = Array.from(document.querySelectorAll<HTMLElement>("[style]"))
    .map((node) => node.style.getPropertyValue("--workbench-player-share"))
    .filter((value) => value !== "");
  if (values.length === 0) return null;
  expect(new Set(values).size).toBe(1);
  return values[0];
}

function focusWrites(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.filter(([key]) => key === FOCUS_KEY);
}

/** One panel on, on the canonical page beside the inspector. */
async function renderCanonicalWithPanel(file: FileItem = VIDEO) {
  arrange("beside");
  claimSlot("player-side", [TRANSCRIPT]);
  storePanels(["transcript"]);
  const utils = await renderFile(file);
  expect(fit()).toBe("beside");
  expect(shownPanels()).toEqual(["Transcript"]);
  return utils;
}

describe("SPEC-CORE-104 I1 where the Enlarge panels button is drawn", () => {
  it.each<Form>(["beside", "stacked-closed"])(
    "SPEC-CORE-104 I1 draws exactly one button in the %s form while a panel is shown under a framed player",
    async (form) => {
      arrange(form);
      claimSlot("player-side", [TRANSCRIPT]);
      storePanels(["transcript"]);
      await renderFile(VIDEO);
      expect(fit()).toBe(form === "stacked-closed" ? "stacked" : form);
      expect(shownPanels()).toEqual(["Transcript"]);

      expect(buttons()).toHaveLength(1);
    },
  );

  it("SPEC-CORE-104 I1 draws one button, not one per panel, with two panels shown", async () => {
    arrange("beside");
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    storePanels(["transcript", "scenes"]);
    await renderFile(VIDEO);
    expect(shownPanels()).toEqual(["Transcript", "Scenes"]);

    expect(buttons()).toHaveLength(1);
  });

  it("SPEC-CORE-104 I1 draws the button for a framed .loft player", async () => {
    await renderCanonicalWithPanel(LOFT);

    expect(buttons()).toHaveLength(1);
  });

  it("SPEC-CORE-104 I1 puts the button in the row after the Panels group and before the preview actions, inside neither", async () => {
    arrange("beside");
    claimSlot("player-side", [TRANSCRIPT]);
    claimSlot("file-preview-actions", [
      { id: "quote", label: "Quote", priority: 10, addonName: "other" },
    ]);
    storePanels(["transcript"]);
    await renderFile(VIDEO);

    const button = enlarge();
    const group = panelGroup()!;
    const row = group.parentElement!;
    const actions = document.querySelector("[data-preview-actions]")!;
    expect(actions).not.toBeNull();
    expect(row).toContainElement(button);
    expect(group).not.toContainElement(button);
    expect(actions).not.toContainElement(button);
    expect(
      group.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      button.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("inspector-pane")).not.toContainElement(button);
  });

  type Absent = {
    name: string;
    form: Form;
    file: FileItem;
    stored: string[];
    surface?: "collection";
    /** The rows that vary only the player or the surface still show the panel. */
    panelShown?: boolean;
  };
  it.each<Absent>([
    { name: "with no panel turned on", form: "beside", file: VIDEO, stored: [] },
    {
      name: "when the only stored id is not a panel this file has",
      form: "beside",
      file: VIDEO,
      stored: ["ghost"],
    },
    {
      name: "in stacked with the inspector open",
      form: "stacked-open",
      file: VIDEO,
      stored: ["transcript"],
    },
    { name: "on the phone", form: "phone", file: VIDEO, stored: ["transcript"] },
    {
      name: "for an unframed (audio) player",
      form: "beside",
      file: AUDIO,
      stored: ["transcript"],
      panelShown: true,
    },
    {
      name: "on the collection surface",
      form: "beside",
      file: VIDEO,
      stored: ["transcript"],
      surface: "collection",
      panelShown: true,
    },
  ])(
    "SPEC-CORE-104 I1 draws no button $name, where the canonical page with a panel draws one",
    async ({ form, file, stored, surface, panelShown }) => {
      window.localStorage.setItem(FOCUS_KEY, "true");
      arrange(form);
      claimSlot("player-side", [TRANSCRIPT]);
      storePanels(stored);
      await renderFile(file, { surface });
      if (form === "stacked-open") {
        expect(fit()).toBe("stacked");
        expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
      }
      if (form === "phone") {
        expect(screen.getByTestId("mobile-inspector-peek")).toBeInTheDocument();
      }
      if (panelShown) expect(shownPanels()).toEqual(["Transcript"]);

      expect(buttons()).toHaveLength(0);

      drawAgain();
      await renderCanonicalWithPanel();
      expect(buttons()).toHaveLength(1);
    },
  );

  it("SPEC-CORE-104 I1 I6 takes the button away when the only panel answers false, and brings it back with the panel", async () => {
    arrange("beside");
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderFile(VIDEO);
    expect(buttons()).toHaveLength(1);

    fireEvent.click(screen.getByTestId("slot-entry-transcript-empty"));
    expect(buttons()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("slot-entry-transcript-filled"));
    expect(buttons()).toHaveLength(1);
  });
});

describe("SPEC-CORE-104 I5 the button's name, icon and pressed state", () => {
  it("SPEC-CORE-104 I5 names the button Enlarge panels with the same title in both states, and draws the PanelTopClose icon", async () => {
    await renderCanonicalWithPanel();

    for (const pressed of ["false", "true"]) {
      const button = enlarge();
      expect(button).toHaveAttribute("aria-pressed", pressed);
      expect(button).toHaveAccessibleName(NAME);
      expect(button).toHaveAttribute("title", NAME);
      expect(button.textContent?.trim()).toBe("");
      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.classList).toContain("lucide-panel-top-close");
      press();
    }
  });

  it("SPEC-CORE-104 I5 has the Japanese name パネルを広げる", () => {
    const ja = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/messages-core/ja.json"), "utf8"),
    );
    const en = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/messages-core/en.json"), "utf8"),
    );
    expect(ja.workbench.enlargePanels).toBe("パネルを広げる");
    expect(en.workbench.enlargePanels).toBe("Enlarge panels");
  });

  it.each([
    ["missing", null, "false"],
    ['the string "true"', "true", "true"],
    ['the string "false"', "false", "false"],
    ["empty", "", "false"],
    ['"TRUE"', "TRUE", "false"],
    ['" true"', " true", "false"],
    ['"1"', "1", "false"],
    ["the JSON boolean spelled with quotes", '"true"', "false"],
  ])(
    "SPEC-CORE-104 I2 I5 reads a stored value that is %s as on only when it is exactly \"true\"",
    async (_name, raw, pressed) => {
      if (raw !== null) window.localStorage.setItem(FOCUS_KEY, raw);
      await renderCanonicalWithPanel();

      expect(enlarge()).toHaveAttribute("aria-pressed", pressed);
      expect(playerShare()).toBe(pressed === "true" ? FOCUSED_SHARE : DEFAULT_SHARE);
    },
  );
});

describe("SPEC-CORE-104 pressing the button", () => {
  it("SPEC-CORE-104 I2 I5 a press writes \"true\" and caps the player at 30%; a second writes \"false\" and returns it to 50%", async () => {
    await renderCanonicalWithPanel();
    expect(enlarge()).toHaveAttribute("aria-pressed", "false");
    expect(playerShare()).toBe(DEFAULT_SHARE);
    expect(window.localStorage.getItem(FOCUS_KEY)).toBeNull();

    press();
    expect(window.localStorage.getItem(FOCUS_KEY)).toBe("true");
    expect(enlarge()).toHaveAttribute("aria-pressed", "true");
    expect(playerShare()).toBe(FOCUSED_SHARE);

    press();
    expect(window.localStorage.getItem(FOCUS_KEY)).toBe("false");
    expect(enlarge()).toHaveAttribute("aria-pressed", "false");
    expect(playerShare()).toBe(DEFAULT_SHARE);
  });

  it("SPEC-CORE-104 I4 a press leaves workbench-panels exactly as stored", async () => {
    arrange("beside");
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    storePanels(["scenes", "ghost"]);
    await renderFile(VIDEO);
    const before = window.localStorage.getItem(STORE_KEY);
    const writes = vi.spyOn(Storage.prototype, "setItem");

    press();
    press();

    expect(writes.mock.calls.filter(([key]) => key === STORE_KEY)).toEqual([]);
    expect(window.localStorage.getItem(STORE_KEY)).toBe(before);
    expect(focusWrites(writes)).toHaveLength(2);
  });

  it.each([
    ["a video", VIDEO],
    ["a .loft", LOFT],
  ])(
    "SPEC-CORE-104 I4 a press does not remount the player of %s",
    async (_name, file) => {
      await renderCanonicalWithPanel(file);
      const player = screen.getByTestId("file-preview");

      press();
      expect(playerShare()).toBe(FOCUSED_SHARE);
      press();

      expect(screen.getByTestId("file-preview")).toBe(player);
    },
  );

  it("SPEC-CORE-104 I5 follows a press made in another window, aria-pressed and the cap both", async () => {
    await renderCanonicalWithPanel();
    expect(enlarge()).toHaveAttribute("aria-pressed", "false");

    act(() => {
      window.localStorage.setItem(FOCUS_KEY, "true");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: FOCUS_KEY,
          oldValue: null,
          newValue: "true",
          storageArea: window.localStorage,
        }),
      );
    });

    expect(enlarge()).toHaveAttribute("aria-pressed", "true");
    expect(playerShare()).toBe(FOCUSED_SHARE);

    act(() => {
      window.localStorage.setItem(FOCUS_KEY, "false");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: FOCUS_KEY,
          oldValue: "true",
          newValue: "false",
          storageArea: window.localStorage,
        }),
      );
    });

    expect(enlarge()).toHaveAttribute("aria-pressed", "false");
    expect(playerShare()).toBe(DEFAULT_SHARE);
  });

  it("SPEC-CORE-104 I5 flips the value in memory when storage throws, and shows nothing", async () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === FOCUS_KEY) throw new DOMException("denied", "SecurityError");
      return getItem.call(this, key);
    });
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === FOCUS_KEY) throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    });
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    await renderCanonicalWithPanel();
    expect(enlarge()).toHaveAttribute("aria-pressed", "false");

    press();

    expect(enlarge()).toHaveAttribute("aria-pressed", "true");
    expect(playerShare()).toBe(FOCUSED_SHARE);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();

    press();
    expect(enlarge()).toHaveAttribute("aria-pressed", "false");
    expect(playerShare()).toBe(DEFAULT_SHARE);
  });
});

describe("SPEC-CORE-104 I6 only a press writes the value", () => {
  it("SPEC-CORE-104 I6 closing every panel, a form change, a file change and a remount write nothing; a press does", async () => {
    window.localStorage.setItem(FOCUS_KEY, "true");
    arrange("beside");
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    const { rerender, unmount } = await renderFile(VIDEO);
    expect(enlarge()).toHaveAttribute("aria-pressed", "true");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removes = vi.spyOn(Storage.prototype, "removeItem");

    fireEvent.click(screen.getByRole("button", { name: "Close Transcript" }));
    expect(shownPanels()).toEqual([]);
    expect(buttons()).toHaveLength(0);

    fireEvent.click(toggle("Transcript"));
    expect(enlarge()).toHaveAttribute("aria-pressed", "true");
    expect(playerShare()).toBe(FOCUSED_SHARE);

    resizeRowTo(NARROW_ROW);
    expect(fit()).toBe("stacked");
    resizeRowTo(WIDE_ROW);
    expect(fit()).toBe("beside");

    setApiResponses(makeFile({ id: "f2", has_chapters: true }));
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await waitFor(() => expect(buttons()).toHaveLength(1));
    expect(enlarge()).toHaveAttribute("aria-pressed", "true");

    unmount();
    await renderFile(VIDEO);
    expect(enlarge()).toHaveAttribute("aria-pressed", "true");

    expect(focusWrites(writes)).toEqual([]);
    expect(removes.mock.calls.filter(([key]) => key === FOCUS_KEY)).toEqual([]);
    expect(window.localStorage.getItem(FOCUS_KEY)).toBe("true");

    press();
    expect(focusWrites(writes)).toEqual([[FOCUS_KEY, "false"]]);
  });

  it("SPEC-CORE-104 I6 drawing the page with an unreadable value writes nothing", async () => {
    window.localStorage.setItem(FOCUS_KEY, "yes");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await renderCanonicalWithPanel();

    expect(enlarge()).toHaveAttribute("aria-pressed", "false");
    expect(focusWrites(writes)).toEqual([]);
    expect(window.localStorage.getItem(FOCUS_KEY)).toBe("yes");

    press();
    expect(focusWrites(writes)).toEqual([[FOCUS_KEY, "true"]]);
  });
});

describe("SPEC-CORE-104 I7 surfaces the value does not reach", () => {
  it("SPEC-CORE-104 I7 the collection surface hands its player the same share with the value on as with it absent", async () => {
    arrange("beside");
    claimSlot("player-side", [TRANSCRIPT]);
    storePanels(["transcript"]);
    await renderFile(VIDEO, { surface: "collection" });
    const absent = playerShare();

    drawAgain();
    window.localStorage.setItem(FOCUS_KEY, "true");
    arrange("beside");
    await renderFile(VIDEO, { surface: "collection" });
    expect(playerShare()).toBe(absent);
    expect(buttons()).toHaveLength(0);

    drawAgain();
    await renderCanonicalWithPanel();
    expect(playerShare()).toBe(FOCUSED_SHARE);
  });
});

/* ------------------------------------------------------------------ *
 * The coarse-pointer box. jsdom applies no media query, so the rule is
 * read from the stylesheet for the classes the drawn button carries.
 * ------------------------------------------------------------------ */

function coarsePointerBlocks(css: string): string[] {
  const blocks: string[] = [];
  const opener = /@media[^{]*pointer:\s*coarse[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(css))) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (depth > 0 && index < css.length) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push(css.slice(start, index - 1));
  }
  return blocks;
}

/** Declarations of rules in `block` whose selector is one compound of classes the element has. */
function declarationsFor(block: string, classes: Set<string>): string[] {
  const out: string[] = [];
  for (const rule of block.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = rule[1].split(",").map((s) => s.trim());
    const applies = selectors.some((selector) => {
      if (!/^(\.[A-Za-z0-9_-]+)+$/.test(selector)) return false;
      return selector
        .split(".")
        .filter(Boolean)
        .every((name) => classes.has(name));
    });
    if (applies) out.push(rule[2]);
  }
  return out;
}

describe("SPEC-CORE-104 the button's box under a coarse pointer", () => {
  it("SPEC-CORE-104 grows the circular button to 2.75rem x 2.75rem under pointer: coarse", async () => {
    await renderCanonicalWithPanel();
    const classes = new Set(Array.from(enlarge().classList));
    expect(classes.has("workbench-toggle")).toBe(true);

    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const declarations = coarsePointerBlocks(css)
      .flatMap((block) => declarationsFor(block, classes))
      .join(";");
    expect(declarations).toMatch(/(^|[;\s])(min-)?height:\s*2\.75rem/);
    expect(declarations).toMatch(/(^|[;\s])(min-)?width:\s*2\.75rem/);
  });
});
