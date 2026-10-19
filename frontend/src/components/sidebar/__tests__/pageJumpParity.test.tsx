import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { FIXED_JUMPS } from "@/lib/pageJump";
import { SidebarLibrarySection } from "../SidebarLibrarySection";
import { SidebarSystemSection } from "../SidebarSystemSection";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("the search modal's fixed destinations", () => {
  it("are the sidebar's fixed rows, when every conditional row is showing", () => {
    const { container } = render(
      <>
        <SidebarLibrarySection
          libraryActive={false}
          driveBase="/drive/main"
          currentDrive="main"
          linkClass={() => ""}
          close={() => {}}
        />
        <SidebarSystemSection
          driveBase="/drive/main"
          linkClass={() => ""}
          close={() => {}}
          driveSummary={{ missing_count: 1 } as never}
          isAdmin
        />
      </>,
    );
    const sidebarHrefs = Array.from(container.querySelectorAll("a"), (a) => a.getAttribute("href"));

    expect(sidebarHrefs.sort()).toEqual(FIXED_JUMPS.map((jump) => jump.href("main")).sort());
  });
});
