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
      expect(screen.getByText("intelligence")).toBeInTheDocument();
    });
    expect(screen.getByText("knowledge")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
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
      expect(screen.getByText("intelligence")).toBeInTheDocument();
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
