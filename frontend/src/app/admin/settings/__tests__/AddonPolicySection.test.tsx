// AddonPolicySection test (RED phase)
//
// Choices:
// - Component fetches both /api/admin/config/addon-policy AND /api/addons/status
//   (manifest list) on mount, in any order.
// - Policy shape: { driveName: { addonName: bool | { feature: bool } } }
// - Toggling a checkbox triggers PUT /api/admin/config/addon-policy with the full
//   updated policy object.
// - Errors render inline.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AddonPolicySection } from "@/app/admin/settings/AddonPolicySection";

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

const initialPolicy = {
  main: { intelligence: true, knowledge: false },
  private: { intelligence: false, knowledge: true },
};

const addonsStatusResponse = {
  addons: {
    intelligence: { scope: "drive" },
    knowledge: { scope: "drive" },
  },
  slots: {},
};

function setupSuccessfulLoads() {
  // Both calls can occur; mockImplementation routes based on URL.
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/admin/config/addon-policy") {
      return Promise.resolve(jsonResponse(initialPolicy));
    }
    if (url === "/api/addons/status") {
      return Promise.resolve(jsonResponse(addonsStatusResponse));
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  });
}

describe("AddonPolicySection", () => {
  it("loads policy and addon list and renders matrix of toggles", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(screen.getByText("intelligence")).toBeInTheDocument();
    });
    expect(screen.getByText("knowledge")).toBeInTheDocument();
    // Drive labels also rendered
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("private")).toBeInTheDocument();
  });

  it("toggling a cell PUTs updated policy", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(screen.getByText("intelligence")).toBeInTheDocument();
    });

    // Find a checkbox/toggle for main x knowledge (currently false)
    const toggles = screen.getAllByRole("checkbox");
    expect(toggles.length).toBeGreaterThan(0);
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/admin/config/addon-policy" && opts?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
    });
  });

  it("renders transcription_cloud sub-toggle when intelligence is enabled", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(screen.getByText("intelligence")).toBeInTheDocument();
    });

    // main has intelligence: true → sub-toggle present
    const mainSubToggle = screen.queryByTestId(
      "feature-row-main-intelligence-transcription_cloud",
    );
    expect(mainSubToggle).toBeInTheDocument();

    // private has intelligence: false → no sub-toggle
    const privateSubToggle = screen.queryByTestId(
      "feature-row-private-intelligence-transcription_cloud",
    );
    expect(privateSubToggle).toBeNull();
  });

  it("toggling transcription_cloud PUTs feature dict policy", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(screen.getByText("intelligence")).toBeInTheDocument();
    });

    const subToggle = screen.getByLabelText(
      "main / intelligence / transcription_cloud",
    );
    fireEvent.click(subToggle);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/admin/config/addon-policy" && opts?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall![1].body);
      // Default of transcription_cloud is true; clicking flips it to false
      // and promotes intelligence to a feature dict.
      expect(body.main.intelligence).toEqual({ transcription_cloud: false });
    });
  });

  it("server unknown_addon error shows inline error", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/admin/config/addon-policy" && opts?.method === "PUT") {
        return Promise.resolve(
          jsonResponse(
            {
              detail: {
                code: "unknown_addon",
                field: "addons",
                message: "manifest に存在しない addon です",
              },
            },
            422,
          ),
        );
      }
      if (url === "/api/admin/config/addon-policy") {
        return Promise.resolve(jsonResponse(initialPolicy));
      }
      if (url === "/api/addons/status") {
        return Promise.resolve(jsonResponse(addonsStatusResponse));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(screen.getByText("intelligence")).toBeInTheDocument();
    });

    const toggles = screen.getAllByRole("checkbox");
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/unknown_addon|manifest|存在しない addon/),
      ).toBeInTheDocument();
    });
  });
});
