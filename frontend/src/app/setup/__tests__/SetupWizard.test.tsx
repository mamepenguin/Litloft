// SetupWizard integration test (Phase 2: multi detected-drives).
//
// spec 2026-05-19-gui-first-setup-cli-bootstrap §3.3 / plan Phase 2.
//
// On mount the wizard fetches GET /api/admin/config/setup-status and
// seeds its drive drafts from the returned `drives`. The DriveStep then
// shows those detected drives (name + group editable, path read-only).
// Final submit re-PUTs the whole drive array.
//
// Flow:
//   Language → Welcome → Drive → AccessMode → (Password) → AddonPolicy → Complete
// Password is skipped when access mode is 全公開 (public).
// Final submit calls, in order:
//   PUT  /api/admin/config/drives
//   PUT  /api/admin/config/passwords (protected only)
//   PUT  /api/admin/config/addon-policy
//   POST /api/admin/config/complete-setup
// then router.push('/admin').

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/setup",
}));

import { SetupWizard } from "@/app/setup/SetupWizard";

const mockFetch = vi.fn();

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Default setup-status payload: two detected drives, setup not completed.
const DETECTED = [
  { name: "media", path: "/app/drives/media" },
  { name: "docs", path: "/app/drives/docs" },
];

function defaultMockImpl(url: string) {
  if (url === "/api/admin/config/setup-status") {
    return Promise.resolve(
      jsonResponse({ completed: false, drives: DETECTED }),
    );
  }
  if (url === "/api/addons/status") {
    return Promise.resolve(jsonResponse({ addons: {}, slots: {} }));
  }
  return Promise.resolve(jsonResponse({ ok: true }));
}

beforeEach(() => {
  pushMock.mockReset();
  mockFetch.mockReset();
  mockFetch.mockImplementation(defaultMockImpl);
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Advance past the Welcome step (between Language and Drive).
function passWelcomeStep() {
  const start =
    screen.queryByRole("button", { name: /get started|start|begin/i }) ??
    screen.queryByRole("button", { name: /setup\.welcome\.startButton/i });
  if (start) fireEvent.click(start);
}

// Drive the wizard from Language through the detected DriveStep.
async function reachDriveStep() {
  fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  await waitFor(() => {
    const start =
      screen.queryByRole("button", { name: /get started|start|begin/i }) ??
      screen.queryByRole("button", { name: /setup\.welcome\.startButton/i });
    expect(start).not.toBeNull();
  });
  passWelcomeStep();
  // Detected drive name inputs should be present (default = slug).
  await waitFor(() => {
    expect(screen.getByDisplayValue("media")).toBeInTheDocument();
  });
}

describe("SetupWizard (detected drives)", () => {
  it("writes NEXT_LOCALE cookie when locale is selected", async () => {
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
    render(<SetupWizard />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /english|en/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /english|en/i }));
    expect(document.cookie).toContain("NEXT_LOCALE=en");
  });

  it("fetches setup-status on mount and seeds detected drives", async () => {
    render(<SetupWizard />);
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls).toContain("/api/admin/config/setup-status");
    });
    await reachDriveStep();
    expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    expect(screen.getByDisplayValue("docs")).toBeInTheDocument();
  });

  it("skips PasswordStep when 全公開 is selected", async () => {
    render(<SetupWizard />);
    await reachDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/^password/i)).toBeNull();
    });
  });

  it("preserves edited display name across Next/Back navigation", async () => {
    render(<SetupWizard />);
    await reachDriveStep();

    const firstName = screen.getByDisplayValue("media") as HTMLInputElement;
    fireEvent.change(firstName, { target: { value: "Movies" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // On AccessMode, go Back.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Movies")).toBeInTheDocument();
    });
  });

  it("final submit PUTs the full drive array, then completes and redirects", async () => {
    render(<SetupWizard />);
    await reachDriveStep();

    // Rename the first drive so we can assert it is sent.
    fireEvent.change(screen.getByDisplayValue("media"), {
      target: { value: "Movies" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // AccessMode: 全公開
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // AddonPolicy: skip / next
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /skip|next/i }),
      ).toBeInTheDocument();
    });
    const skipOrNext =
      screen.queryByRole("button", { name: /skip/i }) ??
      screen.getByRole("button", { name: /next/i });
    fireEvent.click(skipOrNext);

    // Complete
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /finish|complete/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /finish|complete/i }),
    );

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls).toEqual(
        expect.arrayContaining([
          "/api/admin/config/drives",
          "/api/admin/config/addon-policy",
          "/api/admin/config/complete-setup",
        ]),
      );
    });

    // The drives PUT body must be the full array with the rename applied.
    const drivesPut = mockFetch.mock.calls.find(
      ([url, opts]) =>
        url === "/api/admin/config/drives" &&
        (opts as RequestInit)?.method === "PUT",
    );
    expect(drivesPut).toBeDefined();
    const body = JSON.parse(
      (drivesPut![1] as RequestInit).body as string,
    );
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Movies");
    expect(body[0].path).toBe("/app/drives/media");
    expect(body[1].name).toBe("docs");

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin");
    });

    const passwordCall = mockFetch.mock.calls.find(
      ([url]) => url === "/api/admin/config/passwords",
    );
    expect(passwordCall).toBeUndefined();
  });

  it("shows mount guidance when zero drives are detected", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-status") {
        return Promise.resolve(
          jsonResponse({ completed: false, drives: [] }),
        );
      }
      if (url === "/api/addons/status") {
        return Promise.resolve(jsonResponse({ addons: {}, slots: {} }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      const start =
        screen.queryByRole("button", {
          name: /get started|start|begin/i,
        }) ??
        screen.queryByRole("button", {
          name: /setup\.welcome\.startButton/i,
        });
      expect(start).not.toBeNull();
    });
    passWelcomeStep();

    await waitFor(() => {
      expect(
        screen.getAllByText(/docker compose up -d --build/i).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByText(/docker-compose\.override\.yml/i).length,
    ).toBeGreaterThan(0);
    // Next on the empty DriveStep must be disabled.
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});

// Welcome-step ordering regression (kept from the original suite).
describe("SetupWizard with WelcomeStep", () => {
  function findWelcomeStartButton(): HTMLElement | null {
    return (
      screen.queryByRole("button", {
        name: /get started|start|begin/i,
      }) ??
      screen.queryByRole("button", {
        name: /setup\.welcome\.startButton/i,
      })
    );
  }

  it("shows Welcome right after Language (before Drive) in public mode", async () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });
    // Detected drive inputs should NOT be visible yet.
    expect(screen.queryByDisplayValue("media")).toBeNull();
  });

  it('clicking "Get started" on Welcome advances to the Drive step', async () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });
    fireEvent.click(findWelcomeStartButton()!);

    await waitFor(() => {
      expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    });
  });

  it('clicking "Back" on Welcome returns to the Language step', async () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).toBeNull();
      expect(
        screen.getByRole("button", { name: /日本語/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /english|en/i }),
      ).toBeInTheDocument();
    });
  });

  it("Welcome appears between Language and Drive in protected flow too", async () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });
    fireEvent.click(findWelcomeStartButton()!);

    await waitFor(() => {
      expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/password protected/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    });
  });
});
