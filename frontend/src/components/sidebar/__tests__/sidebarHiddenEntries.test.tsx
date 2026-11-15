/**
 * SPEC-CORE-114: hidden entries in the sidebar. `SidebarLibrarySection` and `AddonNavRows`
 * take `hiddenKeys`. Section 3, I1, I2, I4, I5, I11 and Section 9 (order of remaining rows).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { AddonNavEntry } from "@/lib/addonNavigation";

// The pathname sits on the Video app, so an unhidden Video row is the active one.
const pathname = "/drive/main/apps/video";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

import { SidebarLibrarySection } from "@/components/sidebar/SidebarLibrarySection";
import { AddonNavRows } from "@/components/sidebar/AddonNavRows";

const linkClass = (_href: string, active?: boolean) => (active ? "active" : "inactive");

const addonEntry = (key: string, label: string): AddonNavEntry => ({
  name: key,
  key,
  navigation: { label, placement: "primary", priority: 1 },
  href: `/drive/main/addons/${key}`,
});
const PRIMARY = [addonEntry("knowledge", "Notes"), addonEntry("photo_diary", "Photo Diary"), addonEntry("media", "Clips")];

const hrefs = (root: HTMLElement) =>
  within(root).queryAllByRole("link").map((a) => a.getAttribute("href"));
const activeLinks = (root: HTMLElement) =>
  within(root).queryAllByRole("link").filter((a) => a.className === "active");

function renderSection(props: { hiddenKeys: ReadonlySet<string> | null; activeAddonKey?: string | null }) {
  const { container } = render(
    <SidebarLibrarySection
      libraryActive={false}
      driveBase="/drive/main"
      currentDrive="main"
      linkClass={linkClass}
      close={vi.fn()}
      primaryAddons={PRIMARY}
      activeAddonKey={props.activeAddonKey ?? null}
      hiddenKeys={props.hiddenKeys}
    />,
  );
  return container;
}

describe("SPEC-CORE-114 sidebar hiddenKeys", () => {
  it("SPEC-CORE-114 Section 3 I1: null (loading) draws Library and no hideable row", () => {
    const root = renderSection({ hiddenKeys: null });
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.queryByText("Video")).toBeNull();
    expect(screen.queryByText("Reading")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.queryByText("Clips")).toBeNull();
    expect(root.querySelectorAll("a").length).toBeGreaterThan(0);
  });

  it("SPEC-CORE-114 I2: a listed built-in removes only that row", () => {
    const root = renderSection({ hiddenKeys: new Set(["video"]) });
    expect(screen.queryByText("Video")).toBeNull();
    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(hrefs(root)).not.toContain("/drive/main/apps/video");
  });

  it("SPEC-CORE-114 I2 Section 9: a listed addon key removes only that row and the rest keep their order", () => {
    renderSection({ hiddenKeys: new Set(["photo_diary"]) });
    const labels = screen.getAllByRole("link").map((a) => a.textContent?.trim());
    const notes = labels.indexOf("Notes");
    const clips = labels.indexOf("Clips");
    expect(labels).not.toContain("Photo Diary");
    expect(notes).toBeGreaterThanOrEqual(0);
    expect(clips).toBe(notes + 1);
  });

  it("SPEC-CORE-114 I4: library and inbox stay when listed, and an unknown key is ignored", () => {
    renderSection({ hiddenKeys: new Set(["library", "inbox", "nope", "video"]) });
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.queryByText("Video")).toBeNull();
    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("SPEC-CORE-114 I11: a hidden entry whose page is open shows no active row", () => {
    const root = renderSection({ hiddenKeys: new Set(["video", "knowledge"]), activeAddonKey: "knowledge" });
    expect(screen.queryByText("Video")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
    expect(activeLinks(root)).toHaveLength(0);
  });

});

describe("SPEC-CORE-114 AddonNavRows hiddenKeys", () => {
  it("SPEC-CORE-114 I2 Section 9: removes the listed entry and keeps the others in order", () => {
    render(
      <AddonNavRows
        entries={PRIMARY}
        linkClass={linkClass}
        close={vi.fn()}
        hiddenKeys={new Set(["photo_diary"])}
      />,
    );
    const labels = screen.getAllByRole("link").map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Notes", "Clips"]);
  });

  it("SPEC-CORE-114 I11: a hidden active key draws no active row", () => {
    const { container } = render(
      <AddonNavRows
        entries={PRIMARY}
        linkClass={linkClass}
        close={vi.fn()}
        activeKey="knowledge"
        hiddenKeys={new Set(["knowledge"])}
      />,
    );
    expect(screen.queryByText("Notes")).toBeNull();
    expect(container.querySelectorAll(".active")).toHaveLength(0);
  });
});
