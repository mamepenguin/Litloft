import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFolderLink } from "../useFolderLink";

const nav = vi.hoisted(() => ({
  pathname: "/drive/main/movies" as string | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

const around = vi.hoisted(() => vi.fn());

vi.mock("@/lib/viewTransitions", () => ({
  transitionAroundNavigation: around,
}));

/** Fires the `onNavigate` the hook builds for `href`. */
function navigateTo(href: string): void {
  let onNavigate: (() => void) | null = null;
  function Probe() {
    onNavigate = useFolderLink()(href).onNavigate;
    return null;
  }
  const view = render(<Probe />);
  onNavigate!();
  view.unmount();
}

beforeEach(() => {
  around.mockClear();
  nav.pathname = "/drive/main/movies";
});

describe("useFolderLink", () => {
  it("asks for a downward transition when the link goes deeper", () => {
    navigateTo("/drive/main/movies/2026");

    expect(around).toHaveBeenCalledWith("folder-down");
  });

  it("asks for an upward transition when the link goes to an ancestor", () => {
    navigateTo("/drive/main");

    expect(around).toHaveBeenCalledWith("folder-up");
  });

  it("asks for a flat transition between two folders side by side", () => {
    navigateTo("/drive/main/photos");

    expect(around).toHaveBeenCalledWith("folder-flat");
  });

  it("ignores the query when working out the direction", () => {
    nav.pathname = "/drive/main";

    navigateTo("/drive/main/movies?sort=name&order=asc");

    expect(around).toHaveBeenCalledWith("folder-down");
  });

  it("claims no direction when the router has no pathname to compare", () => {
    nav.pathname = null;

    navigateTo("/drive/main/movies/2026");

    expect(around).toHaveBeenCalledWith("folder-flat");
  });
});
