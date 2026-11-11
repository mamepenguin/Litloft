/**
 * SPEC-CORE-083: the shell yields the left pane it is given only when every
 * condition holds. The two-pane page covers the happy path end to end; this
 * covers the inputs that page cannot set on its first frame — a tree hidden
 * by its setting, a phone, and the widths a row reports before it is laid
 * out.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileDetailShell } from "../../FileDetailShell";
import { inspectorOpenStorageKey } from "@/lib/inspectorOpenStore";
import { LeftPaneContext, type LeftPaneState } from "@/lib/leftPaneContext";
import { treeYieldStore } from "@/lib/treeYieldStore";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));

/** Narrow: under 60.5rem (968px) once the pane is back. */
const ROW_WITH_PANE = 853;
const PANE_WIDTH = 280;
const VIEWPORT = 1133;

let rowWidth = ROW_WITH_PANE;
let paneWidth = PANE_WIDTH;
let viewport = VIEWPORT;
let pane: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  treeYieldStore.reset();
  rowWidth = ROW_WITH_PANE;
  paneWidth = PANE_WIDTH;
  viewport = VIEWPORT;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: viewport,
  });
  pane = document.createElement("aside");
  Object.defineProperty(pane, "offsetWidth", {
    configurable: true,
    get: () => paneWidth,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => rowWidth,
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(650);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  treeYieldStore.reset();
});

function renderShell({
  isPlayerFile = true,
  leftPane = { element: pane, shownBySetting: true } as LeftPaneState | null,
} = {}) {
  const shell = (
    <FileDetailShell
      drive="main"
      title="clip.mp4"
      fileId="file-a"
      publishesForm
      isPlayerFile={isPlayerFile}
      inspector={<div />}
    >
      <div />
    </FileDetailShell>
  );
  return render(
    leftPane === null ? (
      shell
    ) : (
      <LeftPaneContext.Provider value={leftPane}>{shell}</LeftPaneContext.Provider>
    ),
  );
}

const yielded = () => treeYieldStore.get("main").yielded;

describe("SPEC-CORE-083 the shell's yield conditions", () => {
  it("collapses the pane when every condition holds", () => {
    localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    renderShell();

    expect(yielded()).toBe(true);
    expect(screen.getByTestId("inspector-fit-host")).toBeInTheDocument();
  });

  it.each([
    [
      "the stored setting hides the pane",
      () => ({ leftPane: { element: pane, shownBySetting: false } }),
    ],
    ["there is no left pane", () => ({ leftPane: null })],
    ["the file has no player", () => ({ isPlayerFile: false })],
  ])("does not collapse it when %s", (_name, options) => {
    localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    renderShell(options() as Parameters<typeof renderShell>[0]);

    expect(yielded()).toBe(false);
  });

  it("does not collapse it when the inspector is closed", () => {
    localStorage.setItem(inspectorOpenStorageKey("main"), "false");
    renderShell();

    expect(yielded()).toBe(false);
  });

  it("does not collapse it on a phone", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 700,
    });
    localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    renderShell();

    expect(yielded()).toBe(false);
  });

  it("does not collapse it when the row already holds both", () => {
    localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    rowWidth = VIEWPORT;
    renderShell();

    expect(yielded()).toBe(false);
  });

  it("does not collapse a row that has not been laid out", () => {
    localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    rowWidth = 0;
    renderShell();

    expect(yielded()).toBe(false);
  });

  it("does not collapse a pane that has no width to give back", () => {
    localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    paneWidth = 0;
    renderShell();

    expect(yielded()).toBe(false);
  });

  it.each([
    ["already yielded", () => treeYieldStore.collapse("main")],
    ["reopened", () => treeYieldStore.reopen("main")],
  ])("leaves a pane that is %s alone", (_name, arrange) => {
    localStorage.setItem(inspectorOpenStorageKey("main"), "true");
    arrange();
    renderShell();

    expect(treeYieldStore.get("main")).toMatchObject({
      yielded: _name === "already yielded",
      reopened: _name === "reopened",
    });
  });

  it("follows a player file's default-open inspector, with nothing stored", () => {
    renderShell();

    expect(yielded()).toBe(true);
  });
});
