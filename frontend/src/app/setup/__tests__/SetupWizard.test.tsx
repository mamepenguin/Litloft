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
// - Steps are referenced by accessible button labels (次へ / 戻る / 完了).

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
  const name = screen.getByLabelText(/名前|name/i);
  const path = screen.getByLabelText(/パス|path/i);
  const group = screen.getByLabelText(/group|グループ/i);
  fireEvent.change(name, { target: { value: "main" } });
  fireEvent.change(path, { target: { value: "/data/main" } });
  fireEvent.change(group, { target: { value: "default" } });
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
    fireEvent.click(screen.getByRole("button", { name: /日本語|ja/i }));
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // Step 2: Drive
    fillDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // Step 3: AccessMode -- pick 全公開
    fireEvent.click(screen.getByLabelText(/全公開|public/i));
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // Should now be on AddonPolicyStep (skipping PasswordStep), so no
    // password input should be visible.
    await waitFor(() => {
      expect(screen.queryByLabelText(/^パスワード$|password/i)).toBeNull();
    });
  });

  it("preserves DriveStep state across Next/Back navigation", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ addons: {}, slots: {} }));
    render(<SetupWizard />);

    // Step 1
    fireEvent.click(screen.getByRole("button", { name: /日本語|ja/i }));
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // Step 2: fill, Next
    fillDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // On AccessMode now, go Back
    fireEvent.click(screen.getByRole("button", { name: /戻る|back/i }));

    // Drive fields should still be filled
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/名前|name/i) as HTMLInputElement;
      expect(nameInput.value).toBe("main");
    });
    const pathInput = screen.getByLabelText(/パス|path/i) as HTMLInputElement;
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
    fireEvent.click(screen.getByRole("button", { name: /日本語|ja/i }));
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // Drive
    fillDriveStep();
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // AccessMode: 全公開
    fireEvent.click(screen.getByLabelText(/全公開|public/i));
    fireEvent.click(screen.getByRole("button", { name: /次へ|next/i }));

    // AddonPolicy: skip
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /スキップ|skip|次へ|next/i }),
      ).toBeInTheDocument();
    });
    const skipOrNext =
      screen.queryByRole("button", { name: /スキップ|skip/i }) ??
      screen.getByRole("button", { name: /次へ|next/i });
    fireEvent.click(skipOrNext);

    // Complete
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /完了|finish|complete/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /完了|finish|complete/i }),
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
