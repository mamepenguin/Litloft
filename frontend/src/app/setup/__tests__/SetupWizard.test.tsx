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

const SETUP_TOKEN = "a-valid-setup-token";

beforeEach(() => {
  pushMock.mockReset();
  mockFetch.mockReset();
  mockFetch.mockImplementation(defaultMockImpl);
  vi.stubGlobal("fetch", mockFetch);
  window.history.replaceState(null, "", `/setup?token=${SETUP_TOKEN}`);
});

/** The unlock step verifies the URL's token on mount and steps past it. */
async function renderPastUnlock() {
  render(<SetupWizard />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /日本語/ })).toBeInTheDocument();
  });
}

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
    await renderPastUnlock();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /english|en/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /english|en/i }));
    expect(document.cookie).toContain("NEXT_LOCALE=en");
  });

  it("fetches setup-status on mount and seeds detected drives", async () => {
    await renderPastUnlock();
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls).toContain("/api/admin/config/setup-status");
    });
    await reachDriveStep();
    expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    expect(screen.getByDisplayValue("docs")).toBeInTheDocument();
  });

  it("skips PasswordStep when 全公開 is selected", async () => {
    await renderPastUnlock();
    await reachDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/^password/i)).toBeNull();
    });
  });

  it("preserves edited display name across Next/Back navigation", async () => {
    await renderPastUnlock();
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
    await renderPastUnlock();
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

    await renderPastUnlock();
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
    await renderPastUnlock();
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });
    expect(screen.queryByDisplayValue("media")).toBeNull();
  });

  it('clicking "Get started" on Welcome advances to the Drive step', async () => {
    await renderPastUnlock();
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
    await renderPastUnlock();
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
    await renderPastUnlock();
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
    await renderPastUnlock();
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
    await renderPastUnlock();
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
    await renderPastUnlock();
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
    await renderPastUnlock();
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
    await renderPastUnlock();
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

describe("SetupWizard unlock step", () => {
  function urlsCalledGlobal() {
    return mockFetch.mock.calls.map((c) => c[0] as string);
  }

  it("verifies the URL's token and steps past without a press", async () => {
    render(<SetupWizard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /日本語/ })).toBeInTheDocument();
    });
    const verify = mockFetch.mock.calls.find(
      ([url]) => url === "/api/admin/config/setup-token/verify",
    );
    expect(JSON.parse((verify![1] as RequestInit).body as string)).toEqual({
      token: SETUP_TOKEN,
    });
  });

  it("stays on the token field and says so when the token is rejected", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-token/verify") {
        return Promise.resolve(
          jsonResponse({ detail: { code: "setup_token_invalid" } }, 403),
        );
      }
      return defaultMockImpl(url);
    });
    render(<SetupWizard />);

    expect(await screen.findByText("Invalid token")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /日本語/ })).toBeNull();
    expect(urlsCalledGlobal()).not.toContain("/api/admin/config/drives");
  });

  it("accepts a token typed in when the URL carries none", async () => {
    window.history.replaceState(null, "", "/setup");
    render(<SetupWizard />);

    const field = await screen.findByLabelText(/setup token/i);
    expect(mockFetch.mock.calls.map((c) => c[0] as string)).not.toContain(
      "/api/admin/config/setup-token/verify",
    );

    fireEvent.change(field, { target: { value: "typed-token" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock setup/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /日本語/ })).toBeInTheDocument();
    });
    const verify = mockFetch.mock.calls.find(
      ([url]) => url === "/api/admin/config/setup-token/verify",
    );
    expect(JSON.parse((verify![1] as RequestInit).body as string)).toEqual({
      token: "typed-token",
    });
  });

  it("does not submit on the Enter that confirms an IME conversion", async () => {
    window.history.replaceState(null, "", "/setup");
    render(<SetupWizard />);
    const field = await screen.findByLabelText(/setup token/i);

    fireEvent.change(field, { target: { value: "とーくん" } });
    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: "Enter" });

    expect(mockFetch.mock.calls.map((c) => c[0] as string)).not.toContain(
      "/api/admin/config/setup-token/verify",
    );

    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => {
      expect(mockFetch.mock.calls.map((c) => c[0] as string)).toContain(
        "/api/admin/config/setup-token/verify",
      );
    });
  });

  it("says setup is complete rather than blaming the token", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-token/verify") {
        return Promise.resolve(
          jsonResponse({ detail: { code: "setup_completed" } }, 404),
        );
      }
      return defaultMockImpl(url);
    });
    render(<SetupWizard />);

    expect(await screen.findByText(/setup is complete/i)).toBeInTheDocument();
    expect(screen.queryByText("Invalid token")).toBeNull();
    expect(screen.getByRole("link", { name: /open litloft/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("button", { name: /unlock setup/i })).toBeDisabled();
  });

  it("cannot be re-submitted while it says setup is complete", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-token/verify") {
        return Promise.resolve(
          jsonResponse({ detail: { code: "setup_completed" } }, 404),
        );
      }
      return defaultMockImpl(url);
    });
    render(<SetupWizard />);
    await screen.findByText(/setup is complete/i);
    const before = mockFetch.mock.calls.length;

    fireEvent.keyDown(screen.getByLabelText(/setup token/i), { key: "Enter" });

    expect(mockFetch.mock.calls).toHaveLength(before);
    expect(screen.queryByText("Invalid token")).toBeNull();
  });

  it("stops saying setup is complete once the field is used again", async () => {
    let completed = true;
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-token/verify") {
        return Promise.resolve(
          completed
            ? jsonResponse({ detail: { code: "setup_completed" } }, 404)
            : jsonResponse({ detail: { code: "setup_token_invalid" } }, 403),
        );
      }
      return defaultMockImpl(url);
    });
    render(<SetupWizard />);
    await screen.findByText(/setup is complete/i);

    completed = false;
    fireEvent.change(screen.getByLabelText(/setup token/i), {
      target: { value: "another" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unlock setup/i }));

    expect(await screen.findByText("Invalid token")).toBeInTheDocument();
    expect(screen.queryByText(/setup is complete/i)).toBeNull();
  });

  it("does not mistake another 404 for a finished setup", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/setup-token/verify") {
        return Promise.resolve(jsonResponse({ detail: "Not Found" }, 404));
      }
      return defaultMockImpl(url);
    });
    render(<SetupWizard />);

    expect(await screen.findByText("Invalid token")).toBeInTheDocument();
    expect(screen.queryByText(/setup is complete/i)).toBeNull();
  });

  it("sends the token on the protected flow's password write too", async () => {
    await renderPastUnlock();
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /get started|start|begin|setup\.welcome\.startButton/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/password protected/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.change(await screen.findByLabelText(/^password/i), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      screen.queryByRole("button", { name: /skip/i }) ??
        screen.getByRole("button", { name: /next/i }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /finish|complete/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin"));

    const call = mockFetch.mock.calls.find(
      ([u, opts]) =>
        u === "/api/admin/config/passwords" &&
        (opts as RequestInit)?.method === "PUT",
    );
    expect(call).toBeDefined();
    const headers = (call![1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Litloft-Setup-Token"]).toBe(SETUP_TOKEN);
  });

  it("sends the token it verified, not what was pasted around it", async () => {
    window.history.replaceState(null, "", "/setup");
    render(<SetupWizard />);
    const field = await screen.findByLabelText(/setup token/i);

    fireEvent.change(field, { target: { value: `  ${SETUP_TOKEN}  ` } });
    fireEvent.click(screen.getByRole("button", { name: /unlock setup/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /日本語/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /get started|start|begin|setup\.welcome\.startButton/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      screen.queryByRole("button", { name: /skip/i }) ??
        screen.getByRole("button", { name: /next/i }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /finish|complete/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin"));

    const verify = mockFetch.mock.calls.find(
      ([url]) => url === "/api/admin/config/setup-token/verify",
    );
    const verified = JSON.parse((verify![1] as RequestInit).body as string).token;
    const drives = mockFetch.mock.calls.find(
      ([u, opts]) =>
        u === "/api/admin/config/drives" &&
        (opts as RequestInit)?.method === "PUT",
    );
    const sent = (
      (drives![1] as RequestInit).headers as Record<string, string>
    )["X-Litloft-Setup-Token"];
    expect(sent).toBe(verified);
    expect(sent).toBe(SETUP_TOKEN);
  });

  it("sends the token on every config write and on complete-setup", async () => {
    await renderPastUnlock();
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /get started|start|begin|setup\.welcome\.startButton/i,
      }),
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("media")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      screen.queryByRole("button", { name: /skip/i }) ??
        screen.getByRole("button", { name: /next/i }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /finish|complete/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin"));

    const gated = [
      "/api/admin/config/drives",
      "/api/admin/config/addon-policy",
      "/api/admin/config/complete-setup",
    ];
    for (const url of gated) {
      const call = mockFetch.mock.calls.find(
        ([u, opts]) =>
          u === url && (opts as RequestInit)?.method !== "GET",
      );
      expect(call, url).toBeDefined();
      const headers = (call![1] as RequestInit).headers as Record<string, string>;
      expect(headers["X-Litloft-Setup-Token"], url).toBe(SETUP_TOKEN);
    }
  });
});

describe("SetupWizard in protected mode", () => {
  async function reachCompleteStepProtected(password = "correct horse battery") {
    await renderPastUnlock();
    await reachDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByLabelText(/password protected/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.change(await screen.findByLabelText(/^password/i), {
      target: { value: password },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(
      screen.queryByRole("button", { name: /skip/i }) ??
        screen.getByRole("button", { name: /next/i }),
    );
    return screen.findByRole("button", { name: /finish|complete/i });
  }

  function callsTo(url: string, method = "PUT") {
    return mockFetch.mock.calls.filter(
      ([u, opts]) => u === url && (opts as RequestInit)?.method === method,
    );
  }

  it("saves the password with the admin sentinel and finishes", async () => {
    fireEvent.click(await reachCompleteStepProtected());

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin"));

    const [passwordPut] = callsTo("/api/admin/config/passwords");
    expect(passwordPut).toBeDefined();
    const body = JSON.parse((passwordPut[1] as RequestInit).body as string);
    expect(body).toEqual([
      { password: "correct horse battery", groups: ["__admin__"] },
    ]);
    expect(
      mockFetch.mock.calls.map((c) => c[0] as string),
    ).toContain("/api/auth/unlock");
  });

  it("shows the rejection and does not finish when the password is not saved", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/passwords") {
        return Promise.resolve(
          jsonResponse(
            {
              detail: {
                code: "unknown_group",
                message: "group '__admin__' is not declared by any drive's access_group",
              },
            },
            422,
          ),
        );
      }
      return defaultMockImpl(url);
    });

    fireEvent.click(await reachCompleteStepProtected());

    expect(
      await screen.findByText(
        "group '__admin__' is not declared by any drive's access_group",
      ),
    ).toBeInTheDocument();
    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls).not.toContain("/api/admin/config/complete-setup");
    expect(urls).not.toContain("/api/auth/unlock");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("stops before the password when the drives are not saved", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/admin/config/drives" && init?.method === "PUT") {
        return Promise.resolve(
          jsonResponse(
            { detail: { code: "path_not_found", message: "Path not found in container." } },
            422,
          ),
        );
      }
      return defaultMockImpl(url);
    });

    fireEvent.click(await reachCompleteStepProtected());

    expect(
      await screen.findByText("Path not found in container."),
    ).toBeInTheDocument();
    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls).not.toContain("/api/admin/config/passwords");
    expect(urls).not.toContain("/api/admin/config/addon-policy");
    expect(urls).not.toContain("/api/admin/config/complete-setup");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("finishes when only the unlock fails, since the password is already stored", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/unlock") {
        return Promise.resolve(jsonResponse({ detail: "wrong" }, 401));
      }
      return defaultMockImpl(url);
    });

    fireEvent.click(await reachCompleteStepProtected());

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin"));
    expect(callsTo("/api/admin/config/passwords")).toHaveLength(1);
  });
});
