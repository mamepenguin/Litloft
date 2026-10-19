import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
 * `Sidebar` reads `useCurrentDrive()` and hands it to
 * `SidebarLibrarySection`, which hands it to `SidebarDriveSwitcher`.
 * `SidebarLibrarySection` is the seam, so it is what gets rendered.
 */
function SidebarSlice() {
  const currentDrive = useCurrentDrive();
  return (
    <SidebarLibrarySection libraryActive={false}
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
 * Matched on the visible text rather than the href, because inside a
 * drive the section's own Home link points at `/drive/{name}` too.
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
    expect(screen.queryByText(/media|notes|vault/)).toBeNull();
  });

  it("still offers the way in, one press away", () => {
    renderAt("/");
    const row = screen.getByRole("button", { name: /allDrives/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(driveLinks().map((a) => a.getAttribute("href"))).toEqual([
      "/drive/media?view=home",
      "/drive/notes?view=home",
      "/drive/vault?view=home",
    ]);
  });

  /**
   * `currentDrive` is `pathDrive ?? overrideDrive`, and on `/` there is no
   * `pathDrive` — so an override left behind is the whole answer.
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
   * With a single visible drive `SidebarDriveSwitcher` draws no fold row
   * and lists it — folding one line into two is not a saving.
   */
  it("lists the one drive when there is nothing to choose between", () => {
    pathname.value = "/";
    render(
      <CurrentDriveProvider>
        <SidebarLibrarySection libraryActive={false}
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
