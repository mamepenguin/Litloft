/**
 * SPEC-CORE-193 / I9: below `md` a queue page's pane opens at the viewport's
 * width over the file page, and the tree stays mounted behind it.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";
import { treeVisitStore } from "@/lib/treeVisitStore";
import { treeYieldStore } from "@/lib/treeYieldStore";

const route = {
  pathname: "/drive/work/Q1",
  params: new URLSearchParams("file=f1&queue=folder"),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => route.pathname,
  useSearchParams: () => route.params,
}));

vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
  useOverlaySidebarWhen: () => {},
}));

vi.mock("@/components/folder/RightPaneFile", () => ({
  RightPaneFile: () => <div data-testid="file-view" />,
}));

vi.mock("@/components/folder/FolderTreePane", () => ({
  FolderTreePane: () => <div data-testid="tree-pane" />,
}));

import { TwoPaneLayout } from "../TwoPaneLayout";

let besideMatches = true;

beforeEach(() => {
  localStorage.clear();
  route.params = new URLSearchParams("file=f1&queue=folder");
  treeEnabledStore.reset();
  treeNarrowOpenStore.reset();
  treeVisitStore.reset();
  treeYieldStore.reset();
  besideMatches = true;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return besideMatches;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
});

afterEach(() => {
  treeEnabledStore.reset();
  treeNarrowOpenStore.reset();
  treeVisitStore.reset();
  treeYieldStore.reset();
});

const aside = () => document.querySelector("aside")!;

function renderQueue() {
  return render(
    <TwoPaneLayout
      drive="work"
      folderPath="Q1"
      queuePane
      leftPane={<div data-testid="queue-pane">queue</div>}
      leftPaneAriaLabel="Queue"
      treeUnderPane
    >
      <div data-testid="listing" />
    </TwoPaneLayout>,
  );
}

describe("a folder queue's pane on a phone", () => {
  it("opens at the viewport's width and hides the file's column", () => {
    besideMatches = false;
    treeEnabledStore.set("work", true);
    treeNarrowOpenStore.set("work", true);
    renderQueue();

    expect(screen.getByTestId("queue-pane")).toBeInTheDocument();
    expect(aside()).toHaveAttribute("aria-hidden", "false");
    expect(aside().className).toContain("w-[100vw]");
    expect(screen.getByTestId("file-view")).toBeInTheDocument();
  });

  it("stays closed until the narrow-open state asks for it", () => {
    besideMatches = false;
    treeEnabledStore.set("work", true);
    renderQueue();

    expect(aside()).toHaveAttribute("aria-hidden", "true");
    expect(aside().className).toContain("w-0");
    expect(screen.getByTestId("file-view")).toBeInTheDocument();
  });
});

describe("a folder queue's pane at md and wider", () => {
  it("takes the tree's 280px place and keeps the tree mounted behind it", () => {
    treeEnabledStore.set("work", true);
    renderQueue();

    expect(aside()).toHaveAttribute("aria-hidden", "false");
    expect(aside().className).toContain("md:w-[280px]");
    expect(aside().className).not.toContain("w-0");
    const tree = screen.getByTestId("tree-pane");
    expect(tree.closest(".hidden")).not.toBeNull();
  });

  it("yields to the inspector and comes back with the queue still there", () => {
    treeEnabledStore.set("work", true);
    renderQueue();

    act(() => treeYieldStore.collapse("work"));
    expect(aside()).toHaveAttribute("aria-hidden", "true");
    expect(aside().className).toContain("w-0");

    act(() => treeYieldStore.reopen("work"));
    expect(aside()).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByTestId("queue-pane")).toBeInTheDocument();
  });
});
