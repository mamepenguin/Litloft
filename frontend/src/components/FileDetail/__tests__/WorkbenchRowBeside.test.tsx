/**
 * The beside state of the workbench row on the canonical file page: the
 * `data-row-beside` attribute on the workbench root, the conditions it holds
 * under, and the player node across entering and leaving it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import type { FileItem } from "@/types";
import {
  claimSlot,
  makeFile,
  setApiResponses,
  setViewport,
  loaded,
  shellLoaded,
  slotMocks,
  relationMocks,
  usePolicyMock,
} from "./harness";
import {
  NARROW_ROW,
  SCENES,
  TRANSCRIPT,
  WIDE_ROW,
  fit,
  installRow,
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

/**
 * The harness reports a 700px visible height, so W is the 480px floor and the
 * side space reaches 17rem at a canvas 768px wide.
 */
const BESIDE_ROW = NARROW_ROW;
const UNDER_ROW = 720;

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
  document.documentElement.style.fontSize = "16px";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.fontSize = "";
});

/** Unmounts and drops the window's spies, keeping localStorage. */
function drawAgain() {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetHarness();
}

type Form = "beside" | "stacked-closed" | "stacked-open" | "phone";

function arrange(form: Form) {
  switch (form) {
    case "beside":
      setViewport(1400);
      installRow(WIDE_ROW);
      storeOpen(true);
      return;
    case "stacked-closed":
      setViewport(1024);
      installRow(BESIDE_ROW);
      storeOpen(false);
      return;
    case "stacked-open":
      setViewport(1024);
      installRow(BESIDE_ROW);
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
  if (surface === "collection") await loaded();
  else {
    await shellLoaded();
    await waitFor(() => expect(fit()).not.toBeUndefined());
  }
  return utils;
}

/** Every node carrying the attribute; the beside state puts it on the workbench root only. */
function besideNodes(): Element[] {
  return Array.from(document.querySelectorAll("[data-row-beside]"));
}

function beside(): boolean {
  const nodes = besideNodes();
  if (nodes.length === 0) return false;
  expect(nodes).toHaveLength(1);
  expect(nodes[0].classList.contains("media-detail-workbench")).toBe(true);
  expect(nodes[0].getAttribute("data-row-beside")).toBe("on");
  return true;
}

function enlarge(): HTMLElement {
  const found = screen.queryAllByRole("button", { name: NAME });
  if (found.length !== 1) {
    throw new Error(`expected one ${NAME} button, found ${found.length}`);
  }
  return found[0];
}

function storageEvent(newValue: string) {
  act(() => {
    window.localStorage.setItem(FOCUS_KEY, newValue);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: FOCUS_KEY,
        newValue,
        storageArea: window.localStorage,
      }),
    );
  });
}

async function renderCanonical(
  form: Form = "beside",
  file: FileItem = VIDEO,
  focus: string | null = "true",
) {
  if (focus !== null) window.localStorage.setItem(FOCUS_KEY, focus);
  arrange(form);
  claimSlot("player-side", [TRANSCRIPT]);
  storePanels(["transcript"]);
  const utils = await renderFile(file);
  expect(shownPanels()).toEqual(["Transcript"]);
  return utils;
}

describe("SPEC-CORE-105 §3 where the beside state holds", () => {
  it.each<Form>(["beside", "stacked-closed"])(
    "SPEC-CORE-105 I9 sets data-row-beside=\"on\" on the workbench root in the %s form with the value on, a panel shown and room beside the frame",
    async (form) => {
      await renderCanonical(form);
      expect(fit()).toBe(form === "stacked-closed" ? "stacked" : form);

      expect(beside()).toBe(true);
    },
  );

  it("SPEC-CORE-105 I9 sets it with two panels shown, once", async () => {
    window.localStorage.setItem(FOCUS_KEY, "true");
    arrange("beside");
    claimSlot("player-side", [TRANSCRIPT, SCENES]);
    storePanels(["transcript", "scenes"]);
    await renderFile(VIDEO);
    expect(shownPanels()).toEqual(["Transcript", "Scenes"]);

    expect(beside()).toBe(true);
  });

  it("SPEC-CORE-105 I9 sets it for a framed .loft player", async () => {
    await renderCanonical("beside", LOFT);

    expect(beside()).toBe(true);
  });

  it.each([
    ["missing", null],
    ['"false"', "false"],
    ['"TRUE"', "TRUE"],
    ['"1"', "1"],
    ["empty", ""],
  ])(
    "SPEC-CORE-105 I5 I9 sets no attribute when the stored value is %s, where \"true\" sets it",
    async (_name, raw) => {
      await renderCanonical("beside", VIDEO, raw);
      expect(enlarge()).toHaveAttribute("aria-pressed", "false");

      expect(besideNodes()).toHaveLength(0);

      drawAgain();
      await renderCanonical("beside", VIDEO, "true");
      expect(beside()).toBe(true);
    },
  );

  type Absent = {
    name: string;
    form: Form;
    file: FileItem;
    stored: string[];
    surface?: "collection";
  };
  it.each<Absent>([
    { name: "with no panel turned on", form: "beside", file: VIDEO, stored: [] },
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
    },
    {
      name: "on the collection surface",
      form: "beside",
      file: VIDEO,
      stored: ["transcript"],
      surface: "collection",
    },
  ])(
    "SPEC-CORE-105 I5 sets no attribute $name with the value on, where the canonical page with a panel sets it",
    async ({ form, file, stored, surface }) => {
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

      expect(besideNodes()).toHaveLength(0);

      drawAgain();
      await renderCanonical();
      expect(beside()).toBe(true);
    },
  );
});

describe("SPEC-CORE-105 I6 I9 entering and leaving the beside state", () => {
  it("SPEC-CORE-105 I9 a press leaves the beside state and a second press enters it", async () => {
    await renderCanonical();
    expect(beside()).toBe(true);

    fireEvent.click(enlarge());
    expect(enlarge()).toHaveAttribute("aria-pressed", "false");
    expect(beside()).toBe(false);

    fireEvent.click(enlarge());
    expect(enlarge()).toHaveAttribute("aria-pressed", "true");
    expect(beside()).toBe(true);
  });

  it("SPEC-CORE-105 I9 follows a storage event from another window", async () => {
    await renderCanonical("beside", VIDEO, "false");
    expect(beside()).toBe(false);

    storageEvent("true");
    expect(beside()).toBe(true);

    storageEvent("false");
    expect(beside()).toBe(false);
  });

  it("SPEC-CORE-105 §1 closing every panel leaves the beside state and turning one on enters it again", async () => {
    await renderCanonical();
    expect(beside()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close Transcript" }));
    expect(shownPanels()).toEqual([]);
    expect(beside()).toBe(false);

    fireEvent.click(toggle("Transcript"));
    expect(beside()).toBe(true);
  });

  it("SPEC-CORE-105 §2 I9 a canvas narrowed under 17rem of side space leaves the beside state, and widening it enters again", async () => {
    await renderCanonical("stacked-closed");
    expect(beside()).toBe(true);

    resizeRowTo(UNDER_ROW);
    expect(fit()).toBe("stacked");
    expect(shownPanels()).toEqual(["Transcript"]);
    expect(beside()).toBe(false);

    resizeRowTo(BESIDE_ROW);
    expect(beside()).toBe(true);
  });

  it("SPEC-CORE-105 §1 leaving the workbench forms leaves the beside state", async () => {
    await renderCanonical("beside");
    expect(beside()).toBe(true);

    // The inspector opens beside a canvas under 60.5rem: stacked with it open.
    resizeRowTo(NARROW_ROW);
    expect(fit()).toBe("stacked");
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
    expect(besideNodes()).toHaveLength(0);

    resizeRowTo(WIDE_ROW);
    expect(fit()).toBe("beside");
    expect(beside()).toBe(true);
  });

  it.each([
    ["a video", VIDEO],
    ["a .loft", LOFT],
  ])(
    "SPEC-CORE-105 I6 the player of %s is the same node across a press, a resize, a storage event and closing the last panel",
    async (_name, file) => {
      await renderCanonical("stacked-closed", file);
      const player = screen.getByTestId("file-preview");
      expect(beside()).toBe(true);

      fireEvent.click(enlarge());
      expect(beside()).toBe(false);
      fireEvent.click(enlarge());
      expect(beside()).toBe(true);

      resizeRowTo(UNDER_ROW);
      expect(beside()).toBe(false);
      resizeRowTo(BESIDE_ROW);
      expect(beside()).toBe(true);

      storageEvent("false");
      expect(beside()).toBe(false);
      storageEvent("true");
      expect(beside()).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Close Transcript" }));
      expect(beside()).toBe(false);
      fireEvent.click(toggle("Transcript"));
      expect(beside()).toBe(true);

      expect(screen.getByTestId("file-preview")).toBe(player);
    },
  );

  it("SPEC-CORE-105 I6 a shown panel's entry is the same node across entering and leaving", async () => {
    await renderCanonical("stacked-closed");
    const entry = screen.getByTestId("slot-entry-transcript");
    expect(beside()).toBe(true);

    fireEvent.click(enlarge());
    expect(beside()).toBe(false);
    resizeRowTo(UNDER_ROW);
    fireEvent.click(enlarge());
    expect(beside()).toBe(false);
    resizeRowTo(BESIDE_ROW);
    expect(beside()).toBe(true);
    storageEvent("false");
    expect(beside()).toBe(false);

    expect(screen.getByTestId("slot-entry-transcript")).toBe(entry);
  });
});

describe("SPEC-CORE-105 §4 data", () => {
  it("SPEC-CORE-105 §4 entering and leaving the beside state writes nothing", async () => {
    await renderCanonical("stacked-closed");
    expect(beside()).toBe(true);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removes = vi.spyOn(Storage.prototype, "removeItem");

    resizeRowTo(UNDER_ROW);
    expect(beside()).toBe(false);
    resizeRowTo(BESIDE_ROW);
    expect(beside()).toBe(true);

    expect(writes).not.toHaveBeenCalled();
    expect(removes).not.toHaveBeenCalled();
  });
});
