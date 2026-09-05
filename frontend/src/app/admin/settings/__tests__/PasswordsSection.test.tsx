// PasswordsSection test
//
// Choices:
// - GET /api/admin/config/passwords returns masked entries (password is "***").
// - Adding a password POSTs to /passwords/append with the new entry only
//   (avoids round-tripping masked "***" values through PUT, which the
//   backend correctly rejects).
// - Deleting goes through DELETE /passwords/{index}.
// - Empty list shows a "全公開モード" notice and a CTA "パスワード保護を有効化".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PasswordsSection } from "@/app/admin/settings/PasswordsSection";

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
      // POST body is a single entry, never a masked-laden array
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
    // Wait for the CTA, which is what this test is about, rather than for the
    // notice above it. The two render together today, but `/public/i` is loose
    // enough to match earlier text, and gating on it let the synchronous
    // assertion below run one render too soon — observed once as
    // `Unable to find an accessible element with the role "button"` in CI, on
    // a tree that was green locally and green on a rerun.
    const cta = await screen.findByRole("button", {
      name: /パスワード保護を有効化|enable/i,
    });
    // The notice through the CTA's own container, not by a document-wide text
    // match. `/public/i` matches more than one element once the section has
    // settled, so the original `waitFor` on it resolved on whichever appeared
    // first — which is not necessarily the render that puts the CTA on screen.
    expect(cta.closest("div")).toHaveTextContent(/全公開モード|public/i);
  });
});
