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
 *
 * ## Why the mounting cases are gated on the addon being linked
 *
 * `design-decisions.md` §Addons: "In-process addon enable/disable is
 * controlled by adding/removing a symlink. Do not modify core code." A
 * core case that fails when the symlink is gone makes the addon's absence
 * modify core, which is the thing that rule forbids. Cloning without
 * `--recurse-submodules` reaches the same state.
 *
 * **A virtual mock is not available here, and that is a property of the
 * component rather than of vitest.** `AddonSlot` loads a slot module
 * through `import(\`@/addons/${name}/slots.ts\`)`, a *variable* dynamic
 * import: vite rewrites it into a lookup over a map it builds by globbing
 * the real directory at transform time. With no symlink the map has no
 * entry, and the call rejects before any module id exists for `vi.mock`
 * to key on — measured, `Unknown variable dynamic import:
 * ../addons/intelligence/slots.ts`, and the same message for a name that
 * has never existed. So the gate is the guard `file-kind-parity.test.ts`
 * and `componentFixtureParity.test.tsx` already use.
 *
 * What the gate costs is bounded on both sides. It closes only where no
 * addon is installed; CI checks out the submodules, runs
 * `setup-addons.sh`, and then asks the collector whether it picked up
 * each addon's tests, so the armed state is the one that gates merges.
 * And the claim the layout cases exist for — that a branch draws its own
 * chrome — is asserted separately below against a module that resolves in
 * neither state, so it holds whether or not anything is linked.
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
 * Both addons whose slot modules the cases below mock, not either.
 *
 * The directory-not-empty half separates the two states
 * `file-kind-parity.test.ts` names: git materialises a directory for
 * every gitlink on checkout, so an uninitialised submodule is a present
 * empty directory rather than a missing one.
 */
const addonsLinked = ["knowledge", "intelligence"].every((name) => {
  const dir = resolve(SRC, "addons", name);
  return existsSync(dir) && readdirSync(dir).length > 0;
});

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

  it.runIf(addonsLinked)("stacks every entry at once, with no chrome of its own", async () => {
    slotsState.entries = twoEntries;
    const { container } = render(<AddonSlot id="file-detail-sections" layout="stack" />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // *Every* entry, not the first: reading `firstElementChild` alone let a
    // stack that dropped everything after the first pass this assertion
    // while the file's other tests caught it — a test whose name outran
    // what it looked at.
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
   * The chrome each branch draws, with no addon installed.
   *
   * The two cases above are the stronger statement and they are gated on
   * the symlinks; this one is what survives the gate. Its entries name an
   * addon that resolves in neither state, so `SlotEntryRenderer` fails its
   * load and renders nothing on both paths — which leaves exactly the
   * difference between the branches, and that difference is what the
   * describe's docstring says went undetected: a `tabs` branch returning
   * the stack's output.
   *
   * It is a weaker claim than the gated pair, not a substitute for it: it
   * holds the strip's existence and its labels, and says nothing about
   * which entry mounts under it.
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
