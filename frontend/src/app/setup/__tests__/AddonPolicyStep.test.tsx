// AddonPolicyStep test (RED phase)
//
// Choices:
// - Step is optional. It loads the addon manifest list from /api/addons/status
//   and shows a matrix of (drive × addon) toggles, where the drives come from
//   props (passed from the wizard, not from /admin/config/drives — at this
//   point drives haven't been saved yet).
// - "スキップ" button calls onNext without committing changes.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AddonPolicyStep } from "@/app/setup/steps/AddonPolicyStep";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AddonPolicyStep", () => {
  it("loads addon list from /api/addons/status and renders matrix", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        addons: {
          intelligence: { scope: "drive" },
          knowledge: { scope: "drive" },
        },
        slots: {},
      }),
    );
    render(
      <AddonPolicyStep
        drives={[
          { name: "main", path: "/data/main", access_group: "default" },
        ]}
        value={{}}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      // Two now, and on purpose: the legend names the addon once and the
      // drive's row names it once. `getAllByText` rather than a looser
      // query, so a third copy — the per-drive description this change
      // removed — would still fail here.
      expect(screen.getAllByText("intelligence")).toHaveLength(2);
    });
    expect(screen.getAllByText("knowledge")).toHaveLength(2);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("renders the addon description from the API (no 'no description' fallback)", async () => {
    // Regression: addon manifests had no `description` and the
    // /api/addons/status allowlist stripped it, so every row showed the
    // "no description" fallback. When the API surfaces a description it
    // must be rendered.
    mockFetch.mockResolvedValue(
      jsonResponse({
        addons: {
          intelligence: {
            scope: "drive",
            description: "Semantic search and AI summaries.",
          },
        },
        slots: {},
      }),
    );
    render(
      <AddonPolicyStep
        drives={[{ name: "main", path: "/data/main", access_group: "default" }]}
        value={{}}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Semantic search and AI summaries."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/no description/i)).not.toBeInTheDocument();
  });

  it("toggling a cell calls onChange", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        addons: { intelligence: { scope: "drive" } },
        slots: {},
      }),
    );
    const onChange = vi.fn();
    render(
      <AddonPolicyStep
        drives={[
          { name: "main", path: "/data/main", access_group: "default" },
        ]}
        value={{}}
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => {
      // `toHaveLength(2)`, not a bound: `getByText` used to throw on a
      // second match, so the diff that introduced a legend had to loosen
      // this — and `>= 1` is green for any number of copies, which is the
      // one thing this file is about. Two: the legend names the addon
      // once, the drive's row names it once.
      expect(screen.getAllByText("intelligence")).toHaveLength(2);
    });

    const toggle = screen.getAllByRole("checkbox")[0];
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalled();
  });

  it("offers a skip button that advances without changes", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    const onNext = vi.fn();
    render(
      <AddonPolicyStep
        drives={[
          { name: "main", path: "/data/main", access_group: "default" },
        ]}
        value={{}}
        onChange={vi.fn()}
        onNext={onNext}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /スキップ|skip/i }));
    expect(onNext).toHaveBeenCalled();
  });
});


/**
 * The same rule as the settings table's feature legend, and as
 * `lib/listMeta.ts`: a line whose words do not change from row to row is
 * not telling the reader which row they are on.
 *
 * Measured on the running wizard before the change, with the four drives
 * this library has: sixteen description paragraphs saying four things,
 * one under every toggle on every card.
 *
 * **jsdom cannot see the layout** — how wide the paragraph wrapped, or
 * how far the reader had to scroll. Those were measured in Chrome and
 * are in the PR. What is asserted here is the number of copies.
 */
describe("AddonPolicyStep says each addon's description once", () => {
  const DRIVES = [
    { name: "main", path: "/data/main", access_group: "default" },
    { name: "photos", path: "/data/photos", access_group: "default" },
    { name: "work", path: "/data/work", access_group: "default" },
  ];

  const withDescriptions = () =>
    mockFetch.mockResolvedValue(
      jsonResponse({
        addons: {
          intelligence: { scope: "drive", description: "Semantic search and AI summaries." },
          knowledge: { scope: "drive", description: "A linked Markdown notes vault." },
        },
        slots: {},
      }),
    );

  it("draws each description once however many drives there are", async () => {
    withDescriptions();
    render(
      <AddonPolicyStep
        drives={DRIVES}
        value={{}}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    // Six toggles: three drives times two addons. The decision is
    // per-drive and stays per-drive.
    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    });
    // `toBe(1)`, not a bound. A bound goes green again the moment a
    // second copy comes back for a different reason.
    expect(screen.getAllByText("Semantic search and AI summaries.")).toHaveLength(1);
    expect(screen.getAllByText("A linked Markdown notes vault.")).toHaveLength(1);
  });

  it("keeps the description out of the per-drive rows", async () => {
    // Where it is, not only how many: a single copy that had drifted into
    // the first drive's card would satisfy the count and still leave the
    // other two cards unexplained.
    withDescriptions();
    const { container } = render(
      <AddonPolicyStep
        drives={DRIVES}
        value={{}}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    });

    for (const label of Array.from(container.querySelectorAll("label"))) {
      expect(label.textContent).not.toContain("Semantic search");
    }
    expect(
      Array.from(container.querySelectorAll("dd")).filter((dd) =>
        dd.textContent!.includes("Semantic search"),
      ),
    ).toHaveLength(1);
  });

  it("falls back to the placeholder once, not once per drive", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ addons: { intelligence: { scope: "drive" } }, slots: {} }),
    );
    render(
      <AddonPolicyStep
        drives={DRIVES}
        value={{}}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    });
    expect(screen.getAllByText(/no description/i)).toHaveLength(1);
  });
});


describe("AddonPolicyStep explains only controls that are on the page", () => {
  it("draws no legend when there is no drive to switch anything on", async () => {
    // `drives` really can be empty: `SetupWizard` starts it there and
    // leaves it there when the drive probe returns nothing, which is the
    // path `DriveStep`'s mount guidance exists for. A card of addon
    // descriptions above "you can skip this" explains four controls that
    // are not on the page — the rule the settings side already follows
    // and `DESIGN.md` now states.
    mockFetch.mockResolvedValue(
      jsonResponse({
        addons: {
          intelligence: { scope: "drive", description: "Semantic search and AI summaries." },
        },
        slots: {},
      }),
    );
    const { container } = render(
      <AddonPolicyStep
        drives={[]}
        value={{}}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    // The step's own "nothing to configure" line, which is what stands
    // in for the cards when there is no drive.
    await waitFor(() => {
      expect(
        screen.getByText("You can skip and configure later."),
      ).toBeInTheDocument();
    });
    expect(container.querySelectorAll("dl")).toHaveLength(0);
    expect(screen.queryByText("Semantic search and AI summaries.")).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("gives the legend a heading, so it is not a drive card without a name", async () => {
    // Before it had one it was `rounded-xl border border-bg-border
    // bg-bg-card p-5` — the drive card's own class list — carrying the
    // same four addon names in the same order, directly above the real
    // cards. Asserted as "it is not that surface" as well as "it has a
    // name", because either alone leaves the confusion.
    mockFetch.mockResolvedValue(
      jsonResponse({ addons: { intelligence: { scope: "drive" } }, slots: {} }),
    );
    const { container } = render(
      <AddonPolicyStep
        drives={[{ name: "main", path: "/data/main", access_group: "default" }]}
        value={{}}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    });

    const legend = container.querySelector("dl")!.closest("section")!;
    expect(legend.querySelector("h3")!.textContent).toBeTruthy();
    expect(legend.className).not.toContain("bg-bg-card");
    // And the drive's own card still has its name, so the two are told
    // apart by more than the wording of one of them.
    const driveHeading = Array.from(container.querySelectorAll("h3")).find(
      (h) => h.textContent === "main",
    );
    expect(driveHeading).toBeDefined();
  });
});
