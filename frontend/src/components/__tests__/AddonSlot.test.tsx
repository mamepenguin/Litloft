/**
 * Tests for `AddonSlot` — focused on the new `includeIds` / `excludeIds`
 * filters introduced for the Markdown DocumentLayout split (spec
 * `2026-05-10-markdown-document-layout.md`).
 *
 * The dynamic-import path (`@/addons/<name>/slots.ts`) is exercised via
 * a `vi.mock` factory keyed by addon name. Each registered slot module
 * exports a `slotComponents` map matching the entry id; the component
 * renders a div whose data-testid is the entry id, so we can assert on
 * which entries actually mounted under various filter combinations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";

import { AddonSlot } from "../AddonSlot";
import type { SlotEntry } from "@/lib/addons";

// `useAddonSlots` is the single dependency that supplies the entry list.
// Mock it so each test can pick the entry shape directly without
// touching the addon registry / network.
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

// The dynamic `import("@/addons/<name>/slots.ts")` call is resolved by
// vitest at module-graph time; we register a fake module per addon
// name we use in the entries below.
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
  it("renders all entries when neither filter is provided (back-compat)", async () => {
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

  it("renders only the listed ids when `includeIds` is provided", async () => {
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

  it("hides the listed ids when `excludeIds` is provided", async () => {
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

  it("applies excludeIds after includeIds (intersection minus exclude)", async () => {
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

/**
 * What each layout actually draws.
 *
 * `addon-slot-layouts.test.ts` holds the union to the branches, but a
 * branch that returns exactly what the default returns satisfies it —
 * and did: replacing the body of the `tabs` branch with the stack's
 * output left all 353 files green, because nothing anywhere rendered
 * this component as tabs. A layout is a claim about output, so the
 * output is what is asserted here.
 */
describe("AddonSlot — what a layout draws", () => {
  const twoEntries: SlotEntry[] = [
    { id: "intelligence-summary", label: "Summary", priority: 10, addonName: "intelligence" },
    { id: "intelligence-similar", label: "Similar", priority: 20, addonName: "intelligence" },
  ];

  it("stacks every entry at once, with no chrome of its own", () => {
    slotsState.entries = twoEntries;
    const { container } = render(<AddonSlot id="file-detail-sections" layout="stack" />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // A fragment: the entries are the host's own children, which is what
    // lets a menu host keep `menu` → `menuitem` intact.
    expect(container.firstElementChild?.getAttribute("data-testid")).toBe(
      "rendered-intelligence-summary",
    );
  });

  it("draws a strip of one button per entry, and shows only the active one", async () => {
    slotsState.entries = twoEntries;
    render(<AddonSlot id="file-detail-sections" layout="tabs" />);
    const tabs = await screen.findAllByRole("button");
    expect(tabs.map((t) => t.textContent)).toEqual(["Summary", "Similar"]);
    await waitFor(() =>
      expect(screen.getByTestId("rendered-intelligence-summary")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("rendered-intelligence-similar")).not.toBeInTheDocument();
  });
});
