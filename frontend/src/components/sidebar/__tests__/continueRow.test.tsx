/**
 * SPEC-CORE-069 I10: the Continue view's sidebar row and page-jump entry sit
 * directly above Recently Viewed.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FIXED_JUMPS, visibleFixedJumps } from "@/lib/pageJump";
import { routeHidesTree } from "@/lib/driveViews";
import { SidebarLibrarySection } from "../SidebarLibrarySection";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const viewOf = (href: string | null) =>
  href === null ? null : new URL(href, "http://x").searchParams.get("view");

describe("SPEC-CORE-069 I10 the Continue row", () => {
  it("SPEC-CORE-069 links to ?view=continue with a Play icon, directly above Recently Viewed", () => {
    const { container } = render(
      <SidebarLibrarySection
        libraryActive={false}
        driveBase="/drive/main"
        currentDrive="main"
        linkClass={() => ""}
        close={() => {}}
      />,
    );
    const views = Array.from(container.querySelectorAll("a"), (a) => viewOf(a.getAttribute("href")));

    const at = views.indexOf("continue");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(views[at + 1]).toBe("recent");
    const row = screen.getByText("Continue").closest("a")!;
    expect(viewOf(row.getAttribute("href"))).toBe("continue");
    expect(row.querySelector("svg")?.getAttribute("class")).toContain("lucide-play");
  });

  it("SPEC-CORE-069 has a page-jump entry directly above Recently Viewed's", () => {
    const fixed = FIXED_JUMPS.map((jump) => viewOf(jump.href("main")));
    const at = fixed.indexOf("continue");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(fixed[at + 1]).toBe("recent");

    const shown = visibleFixedJumps({ missingCount: 0, isAdmin: false }).map((jump) =>
      viewOf(jump.href("main")),
    );
    expect(shown.indexOf("continue")).toBe(shown.indexOf("recent") - 1);
  });

  it("SPEC-CORE-069 has no folder tree, as ?view=recent has none", () => {
    expect(routeHidesTree({ pathname: "/drive/main", view: "recent" })).toBe(true);
    expect(routeHidesTree({ pathname: "/drive/main", view: "continue" })).toBe(true);
  });
});
