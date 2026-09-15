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

function passWelcomeStep() {
  const start =
    screen.queryByRole("button", { name: /get started|start|begin/i }) ??
    screen.queryByRole("button", { name: /setup\.welcome\.startButton/i });
  if (start) fireEvent.click(start);
}

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

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Movies")).toBeInTheDocument();
    });
  });

  it("final submit PUTs the full drive array, then completes and redirects", async () => {
    render(<SetupWizard />);
    await reachDriveStep();

    fireEvent.change(screen.getByDisplayValue("media"), {
      target: { value: "Movies" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /skip|next/i }),
      ).toBeInTheDocument();
    });
    const skipOrNext =
      screen.queryByRole("button", { name: /skip/i }) ??
      screen.getByRole("button", { name: /next/i });
    fireEvent.click(skipOrNext);

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
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});

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


describe("SetupWizard with addons installed", () => {
  beforeEach(() => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/addons/status") {
        return Promise.resolve(
          jsonResponse({
            addons: { intelligence: { scope: "drive" }, knowledge: { scope: "drive" } },
            slots: {},
          }),
        );
      }
      return defaultMockImpl(url);
    });
  });

  async function reachCompleteStep(onAddonStep?: () => void) {
    render(<SetupWizard />);
    await reachDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(4));
    onAddonStep?.();
    fireEvent.click(
      screen.queryByRole("button", { name: /skip/i }) ??
        screen.getByRole("button", { name: /next/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish|complete/i })).toBeInTheDocument(),
    );
  }

  function addonPolicyPut() {
    const call = mockFetch.mock.calls.find(
      ([url, opts]) =>
        url === "/api/admin/config/addon-policy" && (opts as RequestInit)?.method === "PUT",
    );
    return call ? JSON.parse((call[1] as RequestInit).body as string) : undefined;
  }

  it("stores nothing for switches that were not touched, and counts them on", async () => {
    await reachCompleteStep(() => {
      expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/^4\s*addon/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /finish|complete/i }));
    await waitFor(() => expect(addonPolicyPut()).toEqual({}));
  });

  it("counts every switch once the addon list arrives after the drives", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/addons/status") {
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                jsonResponse({
                  addons: { intelligence: { scope: "drive" }, knowledge: { scope: "drive" } },
                  slots: {},
                }),
              ),
            300,
          ),
        );
      }
      return defaultMockImpl(url);
    });
    await reachCompleteStep();
    expect(screen.getByText(/^4\s*addon/)).toBeInTheDocument();
  });

  it("counts a switch turned off as off", async () => {
    await reachCompleteStep(() => {
      fireEvent.click(screen.getByRole("checkbox", { name: "media / knowledge" }));
    });
    expect(screen.getByText(/^3\s*addon/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /finish|complete/i }));
    await waitFor(() => expect(addonPolicyPut()).toEqual({ media: { knowledge: false } }));
  });
});

describe("SetupWizard addon choices across drive edits", () => {
  const TWO_ADDONS = {
    addons: { intelligence: { scope: "drive" }, knowledge: { scope: "drive" } },
    slots: {},
  };

  function withAddons(overrides: Record<string, () => Promise<Response>> = {}) {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url}`;
      if (overrides[key]) return overrides[key]();
      if (url === "/api/addons/status") return Promise.resolve(jsonResponse(TWO_ADDONS));
      return defaultMockImpl(url);
    });
  }

  async function goToAddonStep() {
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
  }

  function addonPolicyPut() {
    const call = mockFetch.mock.calls.find(
      ([url, opts]) =>
        url === "/api/admin/config/addon-policy" && (opts as RequestInit)?.method === "PUT",
    );
    return call ? JSON.parse((call[1] as RequestInit).body as string) : undefined;
  }

  function urlsCalled() {
    return mockFetch.mock.calls.map((c) => c[0] as string);
  }

  it("keeps a switch turned off with its drive when the drive is renamed afterwards", async () => {
    withAddons();
    render(<SetupWizard />);
    await reachDriveStep();
    await goToAddonStep();
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(4));
    fireEvent.click(screen.getByRole("checkbox", { name: "media / knowledge" }));

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.change(screen.getByDisplayValue("media"), { target: { value: "Movies" } });
    await goToAddonStep();

    expect(screen.getByRole("checkbox", { name: "Movies / knowledge" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /finish|complete/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/^3\s*addon/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /finish|complete/i }));

    await waitFor(() => expect(addonPolicyPut()).toEqual({ Movies: { knowledge: false } }));
  });

  it("shows the rejection and does not finish when the addon policy is not saved", async () => {
    let policyPuts = 0;
    withAddons({
      "PUT /api/admin/config/addon-policy": () => {
        policyPuts += 1;
        return Promise.resolve(
          policyPuts === 1
            ? jsonResponse(
                { detail: { code: "unknown_drive", message: "drive 'media' is not configured" } },
                422,
              )
            : jsonResponse({ ok: true }),
        );
      },
    });
    render(<SetupWizard />);
    await reachDriveStep();
    await goToAddonStep();
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(4));
    fireEvent.click(screen.getByRole("checkbox", { name: "media / knowledge" }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(await screen.findByRole("button", { name: /finish|complete/i }));

    expect(await screen.findByText("drive 'media' is not configured")).toBeInTheDocument();
    expect(urlsCalled()).not.toContain("/api/admin/config/complete-setup");
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /finish|complete/i }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin"));
    expect(screen.queryByText("drive 'media' is not configured")).toBeNull();
  });
});

describe("SetupWizard when the addon list does not load", () => {
  it("finishes without saving a policy that disables anything", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/addons/status") {
        return Promise.resolve(jsonResponse({ detail: "boom" }, 500));
      }
      return defaultMockImpl(url);
    });
    render(<SetupWizard />);
    await reachDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText(/could not load the addon list/i);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(await screen.findByRole("button", { name: /finish|complete/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin"));
    const policyPut = mockFetch.mock.calls.find(
      ([url, opts]) =>
        url === "/api/admin/config/addon-policy" && (opts as RequestInit)?.method === "PUT",
    );
    expect(JSON.parse((policyPut![1] as RequestInit).body as string)).toEqual({});
    expect(
      mockFetch.mock.calls.map((c) => c[0] as string),
    ).toContain("/api/admin/config/complete-setup");
  });

  it("says the list could not be loaded, retries it, and does not count zero addons", async () => {
    let statusCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/addons/status") {
        statusCalls += 1;
        return Promise.resolve(
          statusCalls === 1
            ? jsonResponse({ detail: "boom" }, 500)
            : jsonResponse({ addons: { knowledge: { scope: "drive" } }, slots: {} }),
        );
      }
      return defaultMockImpl(url);
    });
    render(<SetupWizard />);
    await reachDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/could not load the addon list/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await screen.findByRole("button", { name: /finish|complete/i });
    expect(screen.queryByText(/^0\s*addon/)).toBeNull();
    expect(screen.getByText(/left at their defaults/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
    expect(screen.queryByText(/could not load the addon list/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await screen.findByRole("button", { name: /finish|complete/i });
    expect(screen.getByText(/^2\s*addon/)).toBeInTheDocument();
  });
});
