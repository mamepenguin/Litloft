/**
 * Mounting cases are gated on the addon being linked under `src/addons`, not
 * mocked virtually: `AddonSlot` uses a variable dynamic import that vite
 * resolves by globbing the real directory, so with no symlink there is no
 * module id for `vi.mock` to key on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { ReactElement } from "react";

import { AddonSlot } from "../AddonSlot";
import type { SlotEntry } from "@/lib/addons";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Git materialises a directory for every gitlink on checkout, so an
 * uninitialised submodule is a present empty directory rather than a missing one.
 */
const addonsLinked = ["knowledge", "intelligence"].every((name) => {
  const dir = resolve(SRC, "addons", name);
  return existsSync(dir) && readdirSync(dir).length > 0;
});

const slotsState = { entries: [] as SlotEntry[] };

vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: { "file-detail-sections": slotsState.entries },
    loading: false,
    getSlotEntries: (slotId: string) =>
      slotId === "file-detail-sections" ? slotsState.entries : [],
    hasSlot: (slotId: string) =>
      slotId === "file-detail-sections" && slotsState.entries.length > 0,
  }),
}));

function makeStubModule(componentIds: string[]) {
  const slotComponents: Record<string, () => ReactElement> = {};
  for (const id of componentIds) {
    slotComponents[id] = () => <div data-testid={`rendered-${id}`}>{id}</div>;
  }
  return { slotComponents };
}

vi.mock("@/addons/knowledge/slots.ts", () => makeStubModule(["knowledge-edit"]));
vi.mock("@/addons/intelligence/slots.ts", () =>
  makeStubModule(["intelligence-summary", "intelligence-similar"]),
);

beforeEach(() => {
  slotsState.entries = [];
});

describe("AddonSlot — filtering (includeIds / excludeIds)", () => {
  it.runIf(addonsLinked)("renders all entries when neither filter is provided (back-compat)", async () => {
    slotsState.entries = [
      {
        id: "knowledge-edit",
        label: "Editor",
        priority: 10,
        addonName: "knowledge",
      },
      {
        id: "intelligence-summary",
        label: "Summary",
        priority: 20,
        addonName: "intelligence",
      },
      {
        id: "intelligence-similar",
        label: "Similar",
        priority: 30,
        addonName: "intelligence",
      },
    ];
    render(<AddonSlot id="file-detail-sections" />);
    await waitFor(() =>
      expect(screen.getByTestId("rendered-knowledge-edit")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("rendered-intelligence-summary")).toBeInTheDocument();
    expect(screen.getByTestId("rendered-intelligence-similar")).toBeInTheDocument();
  });

  it.runIf(addonsLinked)("renders only the listed ids when `includeIds` is provided", async () => {
    slotsState.entries = [
      {
        id: "knowledge-edit",
        label: "Editor",
        priority: 10,
        addonName: "knowledge",
      },
      {
        id: "intelligence-summary",
        label: "Summary",
        priority: 20,
        addonName: "intelligence",
      },
    ];
    render(
      <AddonSlot
        id="file-detail-sections"
        includeIds={["knowledge-edit"]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("rendered-knowledge-edit")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("rendered-intelligence-summary"),
    ).not.toBeInTheDocument();
  });

  it.runIf(addonsLinked)("hides the listed ids when `excludeIds` is provided", async () => {
    slotsState.entries = [
      {
        id: "knowledge-edit",
        label: "Editor",
        priority: 10,
        addonName: "knowledge",
      },
      {
        id: "intelligence-summary",
        label: "Summary",
        priority: 20,
        addonName: "intelligence",
      },
      {
        id: "intelligence-similar",
        label: "Similar",
        priority: 30,
        addonName: "intelligence",
      },
    ];
    render(
      <AddonSlot
        id="file-detail-sections"
        excludeIds={["knowledge-edit"]}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("rendered-intelligence-summary"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("rendered-intelligence-similar")).toBeInTheDocument();
    expect(
      screen.queryByTestId("rendered-knowledge-edit"),
    ).not.toBeInTheDocument();
  });

  it("returns null (renders nothing) when filtering removes every entry", () => {
    slotsState.entries = [
      {
        id: "knowledge-edit",
        label: "Editor",
        priority: 10,
        addonName: "knowledge",
      },
    ];
    const { container } = render(
      <AddonSlot
        id="file-detail-sections"
        includeIds={["non-existent"]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it.runIf(addonsLinked)("applies excludeIds after includeIds (intersection minus exclude)", async () => {
    slotsState.entries = [
      {
        id: "knowledge-edit",
        label: "Editor",
        priority: 10,
        addonName: "knowledge",
      },
      {
        id: "intelligence-summary",
        label: "Summary",
        priority: 20,
        addonName: "intelligence",
      },
      {
        id: "intelligence-similar",
        label: "Similar",
        priority: 30,
        addonName: "intelligence",
      },
    ];
    render(
      <AddonSlot
        id="file-detail-sections"
        includeIds={["intelligence-summary", "intelligence-similar"]}
        excludeIds={["intelligence-similar"]}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("rendered-intelligence-summary"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("rendered-intelligence-similar"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("rendered-knowledge-edit"),
    ).not.toBeInTheDocument();
  });
});

describe("AddonSlot — what a layout draws", () => {
  const twoEntries: SlotEntry[] = [
    { id: "intelligence-summary", label: "Summary", priority: 10, addonName: "intelligence" },
    { id: "intelligence-similar", label: "Similar", priority: 20, addonName: "intelligence" },
  ];

  it.runIf(addonsLinked)("stacks every entry at once, with no chrome of its own", async () => {
    slotsState.entries = twoEntries;
    const { container } = render(<AddonSlot id="file-detail-sections" layout="stack" />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    await waitFor(() =>
      expect(screen.getByTestId("rendered-intelligence-similar")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("rendered-intelligence-summary")).toBeInTheDocument();
    // A fragment: the entries are the host's own children, which is what
    // lets a menu host keep `menu` → `menuitem` intact.
    expect(container.firstElementChild?.getAttribute("data-testid")).toBe(
      "rendered-intelligence-summary",
    );
  });

  it.runIf(addonsLinked)("draws a strip of one button per entry, and shows only the active one", async () => {
    slotsState.entries = twoEntries;
    render(<AddonSlot id="file-detail-sections" layout="tabs" />);
    const tabs = await screen.findAllByRole("button");
    expect(tabs.map((t) => t.textContent)).toEqual(["Summary", "Similar"]);
    await waitFor(() =>
      expect(screen.getByTestId("rendered-intelligence-summary")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("rendered-intelligence-similar")).not.toBeInTheDocument();
  });

  /**
   * An addon that resolves whether or not anything is linked, so the entries
   * render nothing and only the branches' own chrome differs.
   */
  const UNRESOLVABLE_ADDON = "addon-that-is-not-installed";

  it("draws a tab strip for `tabs` and none for `stack`, whatever loads", async () => {
    const entries: SlotEntry[] = twoEntries.map((entry) => ({
      ...entry,
      addonName: UNRESOLVABLE_ADDON,
    }));

    slotsState.entries = entries;
    const stack = render(<AddonSlot id="file-detail-sections" layout="stack" />);
    expect(stack.container.querySelectorAll("button")).toHaveLength(0);
    stack.unmount();

    slotsState.entries = entries;
    render(<AddonSlot id="file-detail-sections" layout="tabs" />);
    const tabs = await screen.findAllByRole("button");
    expect(tabs.map((t) => t.textContent)).toEqual(["Summary", "Similar"]);
  });
});
