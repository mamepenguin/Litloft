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
  it("renders children unwrapped when tree is disabled", () => {
    render(
      <DriveLayout>
        <div data-testid="page">drive home</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("tree-pane")).not.toBeInTheDocument();
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

  it("uses empty folderPath on the search route", () => {
    treeEnabledStore.set("work", true);
    mockPathname = "/drive/work/search";
    render(
      <DriveLayout>
        <div data-testid="page">search</div>
      </DriveLayout>,
    );
    expect(screen.getByTestId("tree-pane")).toBeInTheDocument();
  });
});
