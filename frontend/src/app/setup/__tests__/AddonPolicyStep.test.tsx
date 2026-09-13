// Drives come from props, not from /admin/config/drives: at this point in the
// wizard they haven't been saved yet.

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
      // The legend names the addon once and the drive's row names it once.
      expect(screen.getAllByText("intelligence")).toHaveLength(2);
    });
    expect(screen.getAllByText("knowledge")).toHaveLength(2);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("renders the addon description from the API (no 'no description' fallback)", async () => {
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
      // The legend names the addon once, the drive's row names it once.
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
 * A line whose words do not change from row to row is not telling the
 * reader which row they are on.
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
    // `drives` really can be empty: the wizard leaves it so when the drive
    // probe returns nothing.
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
    // Asserted as "it is not the drive card's surface" as well as "it has a
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
