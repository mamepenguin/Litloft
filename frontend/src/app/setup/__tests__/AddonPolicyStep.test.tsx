// Drives come from props, not from /admin/config/drives: at this point in the
// wizard they haven't been saved yet.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AddonPolicyStep } from "@/app/setup/steps/AddonPolicyStep";
import type { AddonStatusEntry } from "@/lib/adminConfig";

let addons: AddonStatusEntry[] = [];

function given(map: Record<string, Omit<AddonStatusEntry, "name">>) {
  addons = Object.entries(map).map(([name, meta]) => ({ name, ...meta }));
}

describe("AddonPolicyStep", () => {
  it("renders a switch per drive and addon", async () => {
    given({
          intelligence: { scope: "drive" },
          knowledge: { scope: "drive" },
        });
    render(
      <AddonPolicyStep
        addons={addons}
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
    given({
          intelligence: {
            scope: "drive",
            description: "Semantic search and AI summaries.",
          },
        });
    render(
      <AddonPolicyStep
        addons={addons}
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
    given({ intelligence: { scope: "drive" } });
    const onChange = vi.fn();
    render(
      <AddonPolicyStep
        addons={addons}
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
    given({});
    const onNext = vi.fn();
    render(
      <AddonPolicyStep
        addons={addons}
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
    given({
          intelligence: { scope: "drive", description: "Semantic search and AI summaries." },
          knowledge: { scope: "drive", description: "A linked Markdown notes vault." },
        });

  it("draws each description once however many drives there are", async () => {
    withDescriptions();
    render(
      <AddonPolicyStep
        addons={addons}
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
        addons={addons}
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
    given({ intelligence: { scope: "drive" } });
    render(
      <AddonPolicyStep
        addons={addons}
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
    given({
          intelligence: { scope: "drive", description: "Semantic search and AI summaries." },
        });
    const { container } = render(
      <AddonPolicyStep
        addons={addons}
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
    given({ intelligence: { scope: "drive" } });
    const { container } = render(
      <AddonPolicyStep
        addons={addons}
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


describe("AddonPolicyStep shows what the backend enforces", () => {
  const DRIVES = [
    { name: "main", path: "/data/main", access_group: "default" },
    { name: "photos", path: "/data/photos", access_group: "default" },
  ];

  function renderStep(value: Record<string, Record<string, boolean | Record<string, boolean>>>) {
    given({ intelligence: { scope: "drive" }, knowledge: { scope: "drive" } });
    const onChange = vi.fn();
    render(
      <AddonPolicyStep
        addons={addons}
        drives={DRIVES}
        value={value}
        onChange={onChange}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    return onChange;
  }

  const sw = (drive: string, addon: string) =>
    screen.getByRole("checkbox", { name: `${drive} / ${addon}` }) as HTMLInputElement;

  it("shows an addon nothing was stored for as on", () => {
    renderStep({});
    expect(sw("main", "intelligence").checked).toBe(true);
    expect(sw("photos", "knowledge").checked).toBe(true);
  });

  it("shows an addon stored off as off, and only that one", () => {
    renderStep({ main: { knowledge: false }, photos: { knowledge: { index: false } } });
    expect(sw("main", "knowledge").checked).toBe(false);
    expect(sw("main", "intelligence").checked).toBe(true);
    expect(sw("photos", "knowledge").checked).toBe(false);
  });

  it("stores the opposite of what was shown, for that drive and addon only", () => {
    const onChange = renderStep({ main: { knowledge: false }, photos: { knowledge: false } });
    fireEvent.click(sw("main", "intelligence"));
    expect(onChange).toHaveBeenCalledWith({
      main: { knowledge: false, intelligence: false },
      photos: { knowledge: false },
    });
  });

  const nextButton = () => screen.getByRole("button", { name: /^(skip|next)$/i });

  it("offers Skip while nothing is stored for the drives shown", () => {
    renderStep({ elsewhere: { knowledge: false } });
    expect(nextButton()).toHaveTextContent(/skip/i);
  });

  it("offers Next once something is stored, even with every switch on", () => {
    renderStep({ main: { intelligence: true } });
    expect(nextButton()).toHaveTextContent(/next/i);
  });

  it("offers Next once something is stored, even with every switch off", () => {
    renderStep({ main: { intelligence: false, knowledge: false } });
    expect(nextButton()).toHaveTextContent(/next/i);
  });

  it("stores on for an addon shown off", () => {
    const onChange = renderStep({ photos: { knowledge: false } });
    fireEvent.click(sw("photos", "knowledge"));
    expect(onChange).toHaveBeenCalledWith({ photos: { knowledge: true } });
  });
});
