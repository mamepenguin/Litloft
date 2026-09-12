/**
 * What `/drive/{name}` renders, and what it hands the file browser.
 *
 * This route is the only place `?view=` is turned into a screen, and
 * since the Library root became a location rather than a view it is also
 * the only place that decides whether the browser is standing in a
 * folder. Nothing measured either before: the routing table could be
 * retyped and the folder path dropped with the whole suite green.
 *
 * The expected screen and path are declared per value (detector rule 5),
 * and the count is the canonical `?view=` set 裁定 3 of the stage-1
 * brief fixes at seven — so adding a case here without adding it there,
 * or losing one, is visible.
 *
 * Unknown values are part of the contract, not an oversight: they fall
 * through to the drive-wide file list on purpose, and must not be read as
 * the Library root.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import DrivePage from "../page";

let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "main" }),
  useSearchParams: () => search,
}));

/** Each stand-in records the props the route chose for it. */
const seen: { component: string; folderPath: unknown; view: unknown; tagFilter: unknown } = {
  component: "",
  folderPath: undefined,
  view: undefined,
  tagFilter: undefined,
};

vi.mock("@/components/FolderBrowser", () => ({
  FolderBrowser: (props: { folderPath?: string; view?: string | null; tagFilter?: string | null }) => {
    seen.component = "FolderBrowser";
    seen.folderPath = props.folderPath;
    seen.view = props.view;
    seen.tagFilter = props.tagFilter;
    return <div data-testid="screen">browser</div>;
  },
}));
vi.mock("@/components/DriveHome", () => ({
  DriveHome: () => {
    seen.component = "DriveHome";
    return <div data-testid="screen">home</div>;
  },
}));
vi.mock("@/components/trash/TrashView", () => ({
  TrashView: () => {
    seen.component = "TrashView";
    return <div data-testid="screen">trash</div>;
  },
}));
vi.mock("@/components/missing/MissingView", () => ({
  MissingView: () => {
    seen.component = "MissingView";
    return <div data-testid="screen">missing</div>;
  },
}));

/**
 * The canonical `?view=` set, each with the screen it opens and the
 * folder path that screen is given. `null` means the prop is not passed
 * — "no folder to stand in" — and `""` is the drive root's own
 * `folder_path`.
 */
const ROUTES: { view: string; component: string; folderPath: string | undefined }[] = [
  { view: "favorites", component: "FolderBrowser", folderPath: undefined },
  { view: "liked", component: "FolderBrowser", folderPath: undefined },
  { view: "recent", component: "FolderBrowser", folderPath: undefined },
  { view: "recent-added", component: "FolderBrowser", folderPath: undefined },
  { view: "all", component: "FolderBrowser", folderPath: undefined },
  { view: "trash", component: "TrashView", folderPath: undefined },
  { view: "missing", component: "MissingView", folderPath: undefined },
  { view: "library", component: "FolderBrowser", folderPath: "" },
];

const renderAt = (params: Record<string, string> = {}) => {
  search = new URLSearchParams(params);
  seen.component = "";
  seen.folderPath = "UNSET";
  render(<DrivePage />);
};

describe("the drive route", () => {
  it("covers the canonical view set and the Library root", () => {
    // Seven canonical values plus `library` (裁定 3).
    expect(ROUTES).toHaveLength(8);
  });

  it.each(ROUTES)("opens $component at ?view=$view", ({ view, component }) => {
    renderAt({ view });
    expect(seen.component).toBe(component);
    expect(screen.getByTestId("screen")).toBeInTheDocument();
  });

  it.each(ROUTES.filter((r) => r.component === "FolderBrowser"))(
    "hands ?view=$view the folder path $folderPath",
    ({ view, folderPath }) => {
      renderAt({ view });
      expect(seen.folderPath).toBe(folderPath);
      expect(seen.view).toBe(view);
    },
  );

  it("opens Home with no view and no tag", () => {
    renderAt();
    expect(seen.component).toBe("DriveHome");
  });

  it("sends a bare tag filter to the browser with no folder to stand in", () => {
    renderAt({ tag: "soup" });
    expect(seen.component).toBe("FolderBrowser");
    expect(seen.folderPath).toBe(undefined);
    expect(seen.tagFilter).toBe("soup");
  });

  // Unknown values keep falling through to the drive-wide listing by
  // design, and 裁定 3 forbids reading one as the Library root. These are
  // the spellings a lenient comparison would swallow.
  it.each(["not-a-view", "Library", "LIBRARY", "library ", "my-library"])(
    "gives ?view=%o no folder to stand in",
    (view) => {
      renderAt({ view });
      expect(seen.component).toBe("FolderBrowser");
      expect(seen.folderPath).toBe(undefined);
    },
  );

  it("treats an empty ?view= as no view at all", () => {
    renderAt({ view: "" });
    expect(seen.component).toBe("DriveHome");
  });
});
