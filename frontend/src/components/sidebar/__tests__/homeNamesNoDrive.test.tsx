import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * On the root page the sidebar names no drive.
 *
 * The home page's whole content is a grid of drive cards; a sidebar
 * listing the same names beside it is the same answer twice on one
 * screen (H-2). 裁定 R1 settled *how*: fold the sidebar's list rather
 * than remove the cards — the cards carry a file count and the sidebar
 * does not, and the page's job is to get you into a drive quickly.
 *
 * The mechanism is 案 8's, already landed. What is written here is the
 * requirement, end to end: the pathname decides `currentDrive`,
 * `currentDrive` decides whether a drive is named, and no step of that
 * may quietly change. `SidebarDriveSwitcher.test.tsx` covers the
 * component given a `currentDrive`; nothing covered the claim that on
 * `/` there is not one.
 */

const pathname = { value: "/" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

import {
  CurrentDriveProvider,
  useCurrentDrive,
  useSetOverrideDrive,
} from "@/components/CurrentDriveProvider";
import { SidebarLibrarySection } from "../SidebarLibrarySection";
import type { Drive } from "@/types";

const DRIVES: Drive[] = [
  { name: "media", protected: false, file_count: 3 },
  { name: "notes", protected: false, file_count: 1 },
  { name: "vault", protected: true, file_count: 0 },
];

/**
 * The production chain, hop for hop.
 *
 * `Sidebar` reads `useCurrentDrive()` and hands it to
 * `SidebarLibrarySection`, which hands it to `SidebarDriveSwitcher`. An
 * earlier version of this file rendered the switcher directly from the
 * hook and so **re-implemented the one hop it existed to cover**: giving
 * `SidebarLibrarySection` `currentDrive ?? drives[0]?.name` — a drive named
 * in the sidebar beside the cards on `/`, which is precisely H-2 — left the
 * whole suite green. `SidebarLibrarySection` is the seam, so it is what
 * gets rendered.
 */
function SidebarSlice() {
  const currentDrive = useCurrentDrive();
  return (
    <SidebarLibrarySection
      driveBase={currentDrive ? `/drive/${currentDrive}` : null}
      currentDrive={currentDrive}
      drives={DRIVES}
      linkClass={() => ""}
      close={vi.fn()}
    />
  );
}

/** Publishes an override the way the sidebar's collection click does. */
function OverridePublisher({ drive }: { drive: string }) {
  const setOverrideDrive = useSetOverrideDrive();
  useEffect(() => {
    setOverrideDrive(drive);
  }, [drive, setOverrideDrive]);
  return null;
}

function renderAt(path: string, extra?: ReactNode) {
  pathname.value = path;
  return render(
    <CurrentDriveProvider>
      {extra}
      <SidebarSlice />
    </CurrentDriveProvider>,
  );
}

/**
 * Links that *name* a drive, not links that live under one.
 *
 * Matched on the visible text rather than the href, because inside a
 * drive the section's own Home link points at `/drive/{name}` too — same
 * address, and it reads "Home". H-2 is about a link whose subject is a
 * drive's name, which is what a reader sees, so that is what is counted.
 */
const DRIVE_NAMES = DRIVES.map((d) => d.name);

const driveLinks = () =>
  screen
    .queryAllByRole("link")
    .filter((a) => DRIVE_NAMES.includes((a.textContent ?? "").trim()));

afterEach(() => {
  pathname.value = "/";
  cleanup();
});

describe("the root page's sidebar", () => {
  it("links to no drive by name", () => {
    renderAt("/");
    expect(driveLinks()).toHaveLength(0);
    // Nor does it name one in prose: the fold row says how many there
    // are, which is the count the page's own cards do not repeat.
    expect(screen.queryByText(/media|notes|vault/)).toBeNull();
  });

  it("still offers the way in, one press away", () => {
    // Folding is not hiding. The requirement is "not listed on arrival",
    // and a fold that could not be opened would fail H-2 in the other
    // direction — the drives would be unreachable from the sidebar. So the
    // press is made, rather than the row's mere existence being read as
    // proof that pressing it does something.
    renderAt("/");
    const row = screen.getByRole("button", { name: /allDrives/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(driveLinks().map((a) => a.getAttribute("href"))).toEqual([
      "/drive/media",
      "/drive/notes",
      "/drive/vault",
    ]);
  });

  /**
   * A drive published by another surface does not follow you home.
   *
   * `currentDrive` is `pathDrive ?? overrideDrive`, and on `/` there is no
   * `pathDrive` — so an override left behind is the whole answer. The
   * sidebar's own collection click publishes one and never clears it; two
   * other components clear theirs in effect cleanups. Three places
   * remembering one invariant is how it breaks, so the provider now drops
   * the override on every navigation and a surface that still owns a drive
   * republishes it.
   */
  it("does not name a drive left over from another surface", () => {
    const { rerender } = renderAt("/drive/media", <OverridePublisher drive="media" />);
    expect(screen.getByText("media")).toBeInTheDocument();

    pathname.value = "/";
    rerender(
      <CurrentDriveProvider>
        <SidebarSlice />
      </CurrentDriveProvider>,
    );
    expect(driveLinks()).toHaveLength(0);
    expect(screen.queryByText(/media|notes|vault/)).toBeNull();
  });

  /**
   * The one that detects 案 8 being pulled back out from under this.
   *
   * Inside a drive the behaviour is unchanged: the current drive is named
   * once, as the row you press to switch, and the alternatives stay
   * folded. If a change made the list open by default again, the root
   * page's assertions above would go red — but so would this, and this is
   * the one that says which side of the fold moved.
   */
  it("is unchanged inside a drive", () => {
    renderAt("/drive/media");
    // The current drive is named by the switcher's row, which is a button
    // — the alternatives, which would be links, stay folded.
    expect(driveLinks()).toHaveLength(0);
    expect(screen.getByText("media")).toBeInTheDocument();
    expect(screen.queryByText("notes")).toBeNull();
    expect(
      screen.getByRole("button", { name: /switchDrive/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("reads the drive out of a nested path too", () => {
    // `/drive/media/Photos/2024` is still inside `media`; a regex that
    // only matched the bare drive route would name nothing here and put
    // the root page's behaviour on a folder page.
    renderAt("/drive/media/Photos/2024");
    expect(screen.getByText("media")).toBeInTheDocument();
  });

  /**
   * The one install where the root page does list a drive, stated so the
   * requirement is not read as unconditional.
   *
   * With a single visible drive there is nothing to choose between, so
   * `SidebarDriveSwitcher` draws no fold row and lists it — folding one
   * line into two is not a saving, and 案 8 pinned that deliberately. The
   * docs say the same. This is here because the spec's fixture is three
   * drives and cannot see it.
   */
  it("lists the one drive when there is nothing to choose between", () => {
    pathname.value = "/";
    render(
      <CurrentDriveProvider>
        <SidebarLibrarySection
          driveBase={null}
          currentDrive={null}
          drives={[DRIVES[0]!]}
          linkClass={() => ""}
          close={vi.fn()}
        />
      </CurrentDriveProvider>,
    );
    expect(screen.queryByRole("button", { name: /allDrives/ })).toBeNull();
    expect(screen.getByRole("link", { name: "media" })).toBeInTheDocument();
  });
});
