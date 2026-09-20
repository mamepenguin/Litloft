import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import DrivePage from "../page";
import { driveHref } from "@/lib/driveViews";

let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "main" }),
  useSearchParams: () => search,
}));

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
 * `undefined` means the prop is not passed — no folder to stand in — and `""`
 * is the drive root's own `folder_path`.
 */
const ROUTES: { view: string; component: string; folderPath: string | undefined }[] = [
  { view: "favorites", component: "FolderBrowser", folderPath: undefined },
  { view: "liked", component: "FolderBrowser", folderPath: undefined },
  { view: "recent", component: "FolderBrowser", folderPath: undefined },
  { view: "recent-added", component: "FolderBrowser", folderPath: undefined },
  { view: "all", component: "FolderBrowser", folderPath: undefined },
  { view: "trash", component: "TrashView", folderPath: undefined },
  { view: "missing", component: "MissingView", folderPath: undefined },
  { view: "home", component: "DriveHome", folderPath: undefined },
];

const renderAt = (params: Record<string, string> = {}) => {
  search = new URLSearchParams(params);
  seen.component = "";
  seen.folderPath = "UNSET";
  render(<DrivePage />);
};

describe("the drive route", () => {
  it("knows every view value the route branches on, and no others", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/drive/[name]/page.tsx"),
      "utf8",
    );
    const branched = new Set(
      [...source.matchAll(/view === "([^"]+)"/g)].map((m) => m[1]),
    );
    // The pass-through FolderBrowser views are not branched on by name.
    const named = new Set(
      ROUTES.filter((r) => r.component !== "FolderBrowser").map((r) => r.view),
    );
    expect(branched).toEqual(named);
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

  it("opens the Library root with no view and no tag", () => {
    renderAt();
    expect(seen.component).toBe("FolderBrowser");
    expect(seen.folderPath).toBe("");
  });

  // The alias is rewritten, not branched on, so it must reach the browser
  // with the same view the bare URL gives it — a different spelling would
  // file one screen under two list-snapshot keys.
  it("renders ?view=library exactly as the bare drive URL does", () => {
    renderAt();
    const bare = { ...seen };
    renderAt({ view: "library" });
    expect(seen).toEqual(bare);
  });

  it("reaches Home through the href the sidebar and the top page build", () => {
    const view = new URL(driveHref("main", "home"), "http://x").searchParams.get("view");
    renderAt({ view: view as string });
    expect(seen.component).toBe("DriveHome");
  });

  it("sends a bare tag filter to the browser with no folder to stand in", () => {
    renderAt({ tag: "soup" });
    expect(seen.component).toBe("FolderBrowser");
    expect(seen.folderPath).toBe(undefined);
    expect(seen.tagFilter).toBe("soup");
  });

  // Unknown values fall through to the drive-wide listing by design and must
  // not be read as the Library root.
  it.each([
    "not-a-view",
    "Library",
    "LIBRARY",
    "library ",
    "my-library",
    "Home",
    "HOME",
    "home ",
  ])(
    "gives ?view=%o no folder to stand in",
    (view) => {
      renderAt({ view });
      expect(seen.component).toBe("FolderBrowser");
      expect(seen.folderPath).toBe(undefined);
    },
  );

  it("treats an empty ?view= as no view at all", () => {
    renderAt({ view: "" });
    expect(seen.component).toBe("FolderBrowser");
    expect(seen.folderPath).toBe("");
  });
});
