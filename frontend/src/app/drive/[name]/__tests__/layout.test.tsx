import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";

let mockPathname = "/drive/work";
let mockSearchParams = new URLSearchParams();
let mockParams: Record<string, string | string[]> = { name: "work" };

vi.mock("next/navigation", () => ({
  useParams: () => mockParams,
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/folder/FolderTreePane", () => ({
  FolderTreePane: () => <div data-testid="tree-pane" />,
}));
vi.mock("@/components/FilePreview", () => ({
  FilePreview: () => null,
}));
vi.mock("@/components/folder/RightPaneFile", () => ({
  RightPaneFile: ({ fileId, drive }: { fileId: string; drive: string }) => (
    <div data-testid="right-pane">
      file:{fileId}/drive:{drive}
    </div>
  ),
}));

import DriveLayout from "../layout";

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
  mockPathname = "/drive/work";
  mockSearchParams = new URLSearchParams();
  mockParams = { name: "work" };
});

afterEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
});

describe("DriveLayout", () => {
  it("keeps children mounted with tree hidden when tree is disabled", () => {
    // Tree toggle is now a CSS-driven show/hide so children (FolderBrowser /
    // DriveHome / search) survive the toggle without re-mounting. The
    // `<aside>` wrapper is always mounted but aria-hidden, and the
    // `FolderTreePane` is lazy-mounted on first enable so we don't pay
    // for its tree fetch while the user has the tree closed.
    render(
      <DriveLayout>
        <div data-testid="page">drive home</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("tree-pane")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Folder tree")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("wraps children in TwoPaneLayout when tree is enabled at drive root", () => {
    treeEnabledStore.set("work", true);
    render(
      <DriveLayout>
        <div data-testid="page">drive home</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("tree-pane")).toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.getByLabelText("Folder tree")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
  });

  it("wraps children in TwoPaneLayout in sub folders", () => {
    treeEnabledStore.set("work", true);
    mockPathname = "/drive/work/Q1/2026";
    render(
      <DriveLayout>
        <div data-testid="page">sub folder</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("tree-pane")).toBeInTheDocument();
  });

  it("does NOT wrap on addon routes even when tree is enabled", () => {
    treeEnabledStore.set("work", true);
    mockPathname = "/drive/work/addons/intelligence";
    render(
      <DriveLayout>
        <div data-testid="page">addon</div>
      </DriveLayout>,
    );
    expect(screen.queryByTestId("tree-pane")).not.toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("does NOT wrap on the trash recovery view", () => {
    treeEnabledStore.set("work", true);
    mockSearchParams = new URLSearchParams("view=trash");
    render(
      <DriveLayout>
        <div data-testid="page">trash</div>
      </DriveLayout>,
    );
    expect(screen.queryByTestId("tree-pane")).not.toBeInTheDocument();
  });

  it("does NOT wrap on the missing recovery view", () => {
    treeEnabledStore.set("work", true);
    mockSearchParams = new URLSearchParams("view=missing");
    render(
      <DriveLayout>
        <div data-testid="page">missing</div>
      </DriveLayout>,
    );
    expect(screen.queryByTestId("tree-pane")).not.toBeInTheDocument();
  });

  it("decodes drive names with spaces", () => {
    treeEnabledStore.set("my work", true);
    mockParams = { name: "my%20work" };
    mockPathname = "/drive/my%20work";
    render(
      <DriveLayout>
        <div data-testid="page">page</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("tree-pane")).toBeInTheDocument();
  });

  it("does NOT wrap on the search / smart folder route", () => {
    // Search results cross the folder hierarchy — the tree would
    // mislead about where the matched files actually live.
    treeEnabledStore.set("work", true);
    mockPathname = "/drive/work/search";
    render(
      <DriveLayout>
        <div data-testid="page">search</div>
      </DriveLayout>,
    );
    expect(screen.queryByLabelText("Folder tree")).not.toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it.each([
    ["favorites"],
    ["recent-added"],
    ["popular"],
    ["all"],
    ["recent"],
  ])("does NOT wrap on the %s cross-folder view", (view) => {
    treeEnabledStore.set("work", true);
    mockSearchParams = new URLSearchParams(`view=${view}`);
    render(
      <DriveLayout>
        <div data-testid="page">cross folder view</div>
      </DriveLayout>,
    );
    expect(screen.queryByLabelText("Folder tree")).not.toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("mounts RightPaneFile on cross-folder views when ?file= is set", () => {
    // Cross-folder views suppress the tree, but file links inside them
    // (e.g. clicking a file in favorites) should still surface the
    // detail pane.
    mockSearchParams = new URLSearchParams("view=favorites&file=abc123");
    render(
      <DriveLayout>
        <div data-testid="page">favorites grid</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("right-pane")).toHaveTextContent(
      "file:abc123/drive:work",
    );
    expect(screen.queryByLabelText("Folder tree")).not.toBeInTheDocument();
  });

  it("renders RightPaneFile in section when tree is disabled but ?file= is set", () => {
    // The right pane swap is owned by TwoPaneLayout (hasFile branch);
    // the tree aside stays mounted but aria-hidden, and FolderTreePane
    // stays lazy-mounted until the user opens the tree.
    mockSearchParams = new URLSearchParams("file=abc123");
    render(
      <DriveLayout>
        <div data-testid="page">folder behind</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("right-pane")).toHaveTextContent(
      "file:abc123/drive:work",
    );
    expect(screen.getByLabelText("Folder tree")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByTestId("tree-pane")).not.toBeInTheDocument();
    expect(screen.queryByTestId("page")).not.toBeInTheDocument();
  });

  it("does NOT mount RightPaneFile on addon routes even with ?file=", () => {
    mockPathname = "/drive/work/addons/intelligence";
    mockSearchParams = new URLSearchParams("file=abc123");
    render(
      <DriveLayout>
        <div data-testid="page">addon</div>
      </DriveLayout>,
    );
    expect(screen.queryByTestId("right-pane")).not.toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("does NOT mount RightPaneFile on recovery views even with ?file=", () => {
    mockSearchParams = new URLSearchParams("view=trash&file=abc123");
    render(
      <DriveLayout>
        <div data-testid="page">trash</div>
      </DriveLayout>,
    );
    expect(screen.queryByTestId("right-pane")).not.toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });
});
