import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShortcutsProvider } from "../ShortcutsProvider";
import { GlobalSearch } from "../GlobalSearch";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => "main",
  useSetOverrideDrive: () => () => {},
}));

vi.mock("../search/useFileSearch", () => ({
  useFileSearch: () => ({
    merged: [],
    total: 0,
    loading: false,
    semanticPending: false,
    reset: vi.fn(),
  }),
}));
vi.mock("../search/useLauncherRows", () => ({
  useLauncherRows: () => ({
    suggestions: [],
    pageJumps: [],
    folderJumps: [],
    jumps: [],
    browseRows: [],
  }),
}));
vi.mock("../search/useRecentAndHistory", () => ({
  useRecentAndHistory: () => ({
    recentFiles: [],
    recentReply: 0,
    history: [],
    record: vi.fn(),
    forget: vi.fn(),
  }),
}));
vi.mock("../search/useFolderBrowse", () => ({
  useFolderBrowse: () => ({
    path: null,
    loading: false,
    enter: vi.fn(),
    up: vi.fn(),
    leave: vi.fn(),
  }),
}));
vi.mock("../FileTypeIcon", () => ({ FileTypeIcon: () => null }));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function openModal() {
  render(
    <ShortcutsProvider>
      <GlobalSearch />
    </ShortcutsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  return screen.getByPlaceholderText("Search in main...");
}

const chipGroup = () => screen.getByRole("group", { name: "Filters" });
const removeButtons = () => within(chipGroup()).getAllByRole("button");
function accessibleName(element: Element): string {
  return (
    element.getAttribute("aria-label") ??
    element.getAttribute("title") ??
    element.textContent?.trim() ??
    ""
  );
}

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
});

describe("SPEC-CORE-039 I13 the modal shows the input's operators as chips", () => {
  it("draws one chip per distinct operator, in first-appearance order", () => {
    const input = openModal();

    fireEvent.change(input, { target: { value: "type:pdf tag:a tag:b type:video cats" } });

    expect(removeButtons().map(accessibleName)).toEqual([
      "Remove Type PDF",
      "Remove Tag a",
      "Remove Tag b",
      "Remove Type Video",
    ]);
  });

  it("updates the chips on every keystroke", () => {
    const input = openModal();
    expect(screen.queryByRole("group", { name: "Filters" })).toBeNull();

    fireEvent.change(input, { target: { value: "cats tag:会議" } });

    expect(within(chipGroup()).getByRole("button", { name: "Remove Tag 会議" })).toBeInTheDocument();
  });

  it("has no ＋ 条件 button", () => {
    const input = openModal();
    fireEvent.change(input, { target: { value: "cats tag:会議" } });

    expect(screen.queryByRole("button", { name: /(\+|Add filter)/ })).toBeNull();
  });
});

describe("SPEC-CORE-039 I8 a modal chip's ✕ edits the input and navigates nowhere", () => {
  it.each([
    [
      "every spelling of the tag",
      "tag:Meeting tag:meeting type:pdf cats",
      "Remove Tag Meeting",
      "type:pdf cats",
    ],
    [
      "only the chip's own kind",
      "type:markdown type:text type:PDF type:foo cats",
      "Remove Type Text",
      "type:PDF type:foo cats",
    ],
  ])("removes %s", (_name, query, removeName, expected) => {
    const input = openModal();
    fireEvent.change(input, { target: { value: query } });

    fireEvent.click(within(chipGroup()).getByRole("button", { name: removeName }));

    expect(input).toHaveValue(expected);
    expect(document.activeElement).toBe(input);
    expect(router.push).not.toHaveBeenCalled();
  });
});
