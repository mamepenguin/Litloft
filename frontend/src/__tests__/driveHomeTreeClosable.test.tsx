/**
 * A tree pane the drive home can show, it can also put away.
 *
 * `DriveLayout` wraps `/drive/{name}` in `TwoPaneLayout` whether or not a
 * `?view=` is present (`app/drive/[name]/layout.tsx`), and `routeHidesTree`
 * answers `false` there, so the tree pane is mounted on the drive home and
 * shows whenever the drive's stored flag is on. The flag is per-drive and
 * persisted, so it is set by turning the tree on anywhere in the drive —
 * Library, a folder, a file — and carried here.
 *
 * That is why this is asserted rather than "the home draws a toggle". A
 * toggle on a screen whose pane never opens measures nothing, and a pane
 * that opens on a screen with no working control for it is a reader
 * trapped behind it. Spec §6.1 asks for the toggle to be dropped from
 * this screen on the grounds that it does not name Home's subject;
 * arbitration 24 keeps it, because putting the pane away is not a
 * statement about the subject and nothing else here can do it.
 *
 * **Not the `md:hidden` close button inside the pane.** It carries the
 * same accessible name as the header's toggle, writes
 * `treeNarrowOpenStore` rather than the stored flag, and — jsdom applying
 * no stylesheet — is in the document at every width. So "a control named
 * *Hide tree* exists" is true with the header's toggle deleted, and
 * pressing that one with the tree beside the content puts nothing away.
 * The control is therefore taken from the header, and it is judged by
 * whether the pane actually closes.
 *
 * **What this cannot hold.** jsdom lays nothing out, so the pane's width,
 * its transition and whether it visually covers the content are all out of
 * reach (`.claude/rules/review-workflow.md`, "What a test here cannot
 * hold"). `aria-hidden` / `inert` are what the component states about the
 * pane, and they are what is read.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pathname = { current: "/drive/media" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ name: "media" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => pathname.current,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: {}, slots: {}, loading: false, getSlotEntries: () => [], hasSlot: () => false }),
}));
vi.mock("@/components/ProfileProvider", () => ({ useProfile: () => ({ nickname: null, loading: false }) }));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: false, isOverlay: false, close: vi.fn(), setOverlay: vi.fn(), requestRefresh: vi.fn() }),
  useOverlaySidebarWhen: () => {},
}));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isCut: () => false }),
}));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));
// The pane's own contents are not the subject — whether the pane is open
// is. Standing it in keeps this file off the folder-tree fetch.
vi.mock("@/components/folder/FolderTreePane", () => ({
  FolderTreePane: () => <div data-testid="tree-pane-contents" />,
}));
vi.mock("@/lib/api", () => ({
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } }),
  getWatchHistory: vi.fn().mockResolvedValue([]),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getDownloadUrl: () => "",
  getStreamUrl: () => "",
}));

import DriveLayout from "@/app/drive/[name]/layout";
import { DriveHome } from "@/components/DriveHome";

/** The `<aside>` the tree lives in, and what it says about itself. */
function treePane(): HTMLElement {
  return screen.getByRole("complementary", { hidden: true });
}

function paneIsOpen(): boolean {
  return treePane().getAttribute("aria-hidden") === "false";
}

/** The page header's own control, not the one inside the pane. */
function headerTreeControl(): HTMLElement {
  const header = document.querySelector("header")!;
  const control = Array.from(header.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === "Hide tree",
  );
  expect(control, "the header carries no control for the tree").not.toBeUndefined();
  return control!;
}

describe("the drive home and the tree pane", () => {
  beforeEach(() => {
    localStorage.clear();
    pathname.current = "/drive/media";
  });

  it("opens the pane when the drive's stored flag is on", async () => {
    // The population. Without this the closability assertion below is
    // vacuous — there would be nothing to close.
    localStorage.setItem("tree:enabled:media", "true");
    render(
      <DriveLayout>
        <DriveHome driveName="media" />
      </DriveLayout>,
    );
    await screen.findByRole("button", { name: "Add" });
    expect(paneIsOpen()).toBe(true);
    expect(screen.getByTestId("tree-pane-contents")).not.toBeNull();
  });

  it("gives the reader a way to put it away again", async () => {
    localStorage.setItem("tree:enabled:media", "true");
    render(
      <DriveLayout>
        <DriveHome driveName="media" />
      </DriveLayout>,
    );
    await screen.findByRole("button", { name: "Add" });
    expect(paneIsOpen()).toBe(true);

    // By its effect, not by its presence.
    fireEvent.click(headerTreeControl());

    await waitFor(() => expect(paneIsOpen()).toBe(false));
  });
});
