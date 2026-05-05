// SetupWizard integration test (RED phase)
//
// Choices:
// - Wizard step order: Language → Drive → AccessMode → (Password) → AddonPolicy → Complete.
// - When 全公開 is chosen at AccessMode, PasswordStep is skipped.
// - "Next/Back" preserves intermediate state.
// - Final submit calls (in order):
//     PUT /api/admin/config/drives
//     PUT /api/admin/config/passwords (only if protected mode)
//     PUT /api/admin/config/addon-policy
//     POST /api/admin/config/complete-setup
//   then router.push('/admin').
// - Steps are referenced by accessible button labels (Next / Back / Complete).

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

beforeEach(() => {
  pushMock.mockReset();
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

function fillDriveStep() {
  // The DriveStep redesign nests a helper `<p>` inside each `<label>`,
  // so the computed accessible name of each textbox starts with the field
  // label ("Name", "Path", "Group") followed by helper text. Use getByRole
  // with a name pattern anchored to the start so "path" in the group helper
  // ("set passwords") does not match the path input.
  const name = screen.getByRole("textbox", { name: /^name\b/i });
  const path = screen.getByRole("textbox", { name: /^path\b/i });
  const group = screen.getByRole("textbox", { name: /^group\b/i });
  fireEvent.change(name, { target: { value: "main" } });
  fireEvent.change(path, { target: { value: "/data/main" } });
  fireEvent.change(group, { target: { value: "default" } });
}

// Advance past the new Welcome step (inserted between Language and Drive
// by the 2026-04-30 redesign). The button is matched against the
// localized "Get started" or the i18n fallback path.
async function passWelcomeStep() {
  const start =
    screen.queryByRole("button", { name: /get started|start|begin/i }) ??
    screen.queryByRole("button", { name: /setup\.welcome\.startButton/i });
  if (start) fireEvent.click(start);
}

describe("SetupWizard", () => {
  it("writes NEXT_LOCALE cookie when locale is selected", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    // Reset cookies to a known state
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /english|en/i }));
    expect(document.cookie).toContain("NEXT_LOCALE=en");
  });

  it("skips PasswordStep when 全公開 is selected", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    render(<SetupWizard />);

    // Step 1: Language
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Welcome (new, inserted before Drive)
    await passWelcomeStep();

    // Step 2: Drive
    fillDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3: AccessMode -- pick 全公開
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Should now be on AddonPolicyStep (skipping PasswordStep), so no
    // password input should be visible.
    await waitFor(() => {
      expect(screen.queryByLabelText(/^password/i)).toBeNull();
    });
  });

  it("preserves DriveStep state across Next/Back navigation", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    render(<SetupWizard />);

    // Step 1
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Welcome
    await passWelcomeStep();

    // Step 2: fill, Next
    fillDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // On AccessMode now, go Back
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    // Drive fields should still be filled.
    await waitFor(() => {
      const nameInput = screen.getByRole(
        "textbox", { name: /^name\b/i },
      ) as HTMLInputElement;
      expect(nameInput.value).toBe("main");
    });
    const pathInput = screen.getByRole(
      "textbox", { name: /^path\b/i },
    ) as HTMLInputElement;
    expect(pathInput.value).toBe("/data/main");
  });

  it("final submit issues PUT drives, PUT addon-policy, POST complete-setup, then redirects", async () => {
    // Default mock returns ok JSON for all calls
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/addons/status") {
        return Promise.resolve(jsonResponse({ addons: {}, slots: {} }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    render(<SetupWizard />);

    // Language
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Welcome (new, inserted before Drive)
    await passWelcomeStep();

    // Drive
    fillDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // AccessMode: 全公開
    fireEvent.click(screen.getByLabelText(/public/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // AddonPolicy: skip
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
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin");
    });

    // PUT /passwords should NOT be called (公開 mode)
    const passwordCall = mockFetch.mock.calls.find(
      ([url]) => url === "/api/admin/config/passwords",
    );
    expect(passwordCall).toBeUndefined();
  });
});

// Additional tests (RED phase) for the redesigned wizard step order with the
// new Welcome step inserted between Language and Drive.
//
// New flow (public):
//   Language -> Welcome -> Drive -> AccessMode -> AddonPolicy -> Complete
//
// New flow (protected):
//   Language -> Welcome -> Drive -> AccessMode -> Password -> AddonPolicy -> Complete
//
// We detect the Welcome screen by its primary CTA, which is matched against
// the localized text "Get started" or the i18n fallback path
// "setup.welcome.startButton".

function findWelcomeStartButton(): HTMLElement | null {
  return (
    screen.queryByRole("button", { name: /get started|start|begin/i }) ??
    screen.queryByRole("button", { name: /setup\.welcome\.startButton/i })
  );
}

describe("SetupWizard with WelcomeStep", () => {
  it("shows Welcome step right after Language (before Drive) in public mode", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    render(<SetupWizard />);

    // Step 1: Language -> Next
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Welcome should now be visible — the start button must exist.
    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });

    // The Drive step's "name" input should NOT yet be visible.
    expect(screen.queryByLabelText(/name/i)).toBeNull();
  });

  it('clicking "Get started" on Welcome advances to the Drive step', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    render(<SetupWizard />);

    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });

    // Click the start button on Welcome.
    const start = findWelcomeStartButton()!;
    fireEvent.click(start);

    // We should be on DriveStep -> the "名前" / "name" input must appear.
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });
  });

  it('clicking "Back" on Welcome returns to the Language step', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    render(<SetupWizard />);

    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    // Welcome should be gone, the language buttons should be re-visible.
    await waitFor(() => {
      expect(findWelcomeStartButton()).toBeNull();
      // Re-rendered language step shows the Japanese / English buttons.
      expect(
        screen.getByRole("button", { name: /日本語/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /english|en/i }),
      ).toBeInTheDocument();
    });
  });

  it("Welcome appears between Language and Drive even in protected mode flow", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    render(<SetupWizard />);

    // Language -> Next
    fireEvent.click(screen.getByRole("button", { name: /日本語/ }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Welcome -> Get started
    await waitFor(() => {
      expect(findWelcomeStartButton()).not.toBeNull();
    });
    fireEvent.click(findWelcomeStartButton()!);

    // Drive
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });
    fillDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // AccessMode -> protected
    fireEvent.click(screen.getByLabelText(/password protected/i));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Now Password should be visible (AccessMode order is unchanged).
    await waitFor(() => {
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    });
  });
});
