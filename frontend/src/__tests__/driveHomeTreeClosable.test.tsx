import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pathname = { current: "/drive/media" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ name: "media" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => pathname.current,
}));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isCut: () => false }),
}));
vi.mock("@/components/folder/FolderTreePane", () => ({
  FolderTreePane: () => <div data-testid="tree-pane-contents" />,
}));
vi.mock("@/components/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/quick-note", () => ({ QuickNote: () => null }));
vi.mock("@/components/CurrentDriveProvider", () => ({ useCurrentDrive: () => "media" }));
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: null, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } }),
  getWatchHistory: vi.fn().mockResolvedValue([]),
}));

import DriveLayout from "@/app/drive/[name]/layout";
import { FixedTreeToggle } from "@/components/FixedTreeToggle";
import { DriveHome } from "@/components/DriveHome";
import { treeEnabledStore } from "@/lib/treeEnabledStore";

/**
 * Not `localStorage.setItem`: the store keeps a module-level cache that
 * `localStorage.clear()` does not reach.
 */
function driveHasTreeOn(drive: string): void {
  treeEnabledStore.set(drive, true);
}

function treePane(): HTMLElement {
  return screen.getByRole("complementary", { hidden: true });
}

function paneIsOpen(): boolean {
  return treePane().getAttribute("aria-hidden") === "false";
}

/**
 * The control beside the menu button, not the `md:hidden` close button inside the
 * pane: that one carries the same name, is in the document at every width
 * under jsdom, and writes a different store.
 */
function headerTreeControl(): HTMLElement {
  const control = Array.from(document.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === "Hide tree" && !button.closest("aside"),
  );
  expect(control, "the header carries no control for the tree").not.toBeUndefined();
  return control!;
}

describe("the drive home and the tree pane", () => {
  beforeEach(() => {
    localStorage.clear();
    treeEnabledStore.set("media", false);
    pathname.current = "/drive/media";
  });

  it("opens the pane when the drive's stored flag is on", async () => {
    driveHasTreeOn("media");
    render(
      <>
        <FixedTreeToggle />
        <DriveLayout>
          <DriveHome driveName="media" />
        </DriveLayout>
      </>,
    );
    await screen.findByRole("button", { name: "Add" });
    expect(paneIsOpen()).toBe(true);
    expect(screen.getByTestId("tree-pane-contents")).not.toBeNull();
  });

  it("gives the reader a way to put it away again", async () => {
    driveHasTreeOn("media");
    render(
      <>
        <FixedTreeToggle />
        <DriveLayout>
          <DriveHome driveName="media" />
        </DriveLayout>
      </>,
    );
    await screen.findByRole("button", { name: "Add" });
    expect(paneIsOpen()).toBe(true);

    fireEvent.click(headerTreeControl());

    await waitFor(() => expect(paneIsOpen()).toBe(false));
  });
});
