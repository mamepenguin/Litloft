// Adding a password POSTs to /passwords/append with the new entry only, which
// avoids round-tripping masked "***" values through PUT.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PasswordsSection } from "@/app/admin/settings/PasswordsSection";
import { accentFills } from "@/__tests__/helpers/accentFills";

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

describe("PasswordsSection accent budget", () => {
  /**
   * The page's one fill belongs to saving a password, which lives inside
   * the modal; "Add a password" is how you reach the form, not the act itself.
   */
  it("spends nothing with a list on screen and the modal closed", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ password: "***", groups: ["default"] }]),
    );
    const { container } = render(<PasswordsSection />);
    await waitFor(() => {
      expect(screen.getAllByText("***").length).toBeGreaterThanOrEqual(1);
    });
    expect(accentFills(container)).toEqual([]);
  });

  it("spends exactly one once the modal that saves is open", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ password: "***", groups: ["default"] }]),
    );
    const { container } = render(<PasswordsSection />);
    await waitFor(() => {
      expect(screen.getAllByText("***").length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /追加|add/i }));
    expect(accentFills(container)).toHaveLength(1);
  });

  it("spends nothing in public mode either", async () => {
    // `[]` is the graceful-degradation state: no passwords configured, so
    // every drive is public and the section offers to start protecting.
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    const { container } = render(<PasswordsSection />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /有効|enable/i }),
      ).toBeInTheDocument();
    });
    expect(accentFills(container)).toEqual([]);
  });
});

describe("PasswordsSection", () => {
  it("loads masked passwords and shows '***' (never the real value)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { password: "***", groups: ["default"] },
        { password: "***", groups: ["default", "secret"] },
      ]),
    );
    render(<PasswordsSection />);
    await waitFor(() => {
      const masked = screen.getAllByText("***");
      expect(masked.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("adding a password opens modal and POSTs to /passwords/append", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ password: "***", groups: ["default"] }]),
    );
    render(<PasswordsSection />);
    await waitFor(() => {
      expect(screen.getAllByText("***").length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /追加|add/i }));

    const passwordInput = screen.getByLabelText(/パスワード|password/i);
    fireEvent.change(passwordInput, { target: { value: "newSecret" } });

    const groupsInput = screen.getByLabelText(/group|グループ/i);
    fireEvent.change(groupsInput, { target: { value: "secret" } });

    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fireEvent.click(screen.getByRole("button", { name: /保存|save/i }));

    await waitFor(() => {
      const appendCall = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/admin/config/passwords/append" &&
          opts?.method === "POST",
      );
      expect(appendCall).toBeTruthy();
      const body = JSON.parse((appendCall![1] as RequestInit).body as string);
      expect(body.password).toBe("newSecret");
      expect(body.groups).toContain("secret");
    });
  });

  it("server unknown_group error shows inline error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ password: "***", groups: ["default"] }]),
    );
    render(<PasswordsSection />);
    await waitFor(() => {
      expect(screen.getAllByText("***").length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /追加|add/i }));
    fireEvent.change(screen.getByLabelText(/パスワード|password/i), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByLabelText(/group|グループ/i), {
      target: { value: "nonexistent" },
    });
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: {
            code: "unknown_group",
            field: "groups",
            message: "存在しない group が指定されています",
          },
        },
        422,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /保存|save/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/group|グループ|存在しない/),
      ).toBeInTheDocument();
    });
  });

  it("empty passwords list shows 全公開モード notice and CTA", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    render(<PasswordsSection />);
    // Wait for the CTA rather than for the notice above it: `/public/i` is
    // loose enough to match earlier text.
    const cta = await screen.findByRole("button", {
      name: /パスワード保護を有効化|enable/i,
    });
    expect(cta.closest("div")).toHaveTextContent(/全公開モード|public/i);
  });
});
