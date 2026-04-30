// CompleteStep test (RED phase)
//
// Choices:
// - Clicking "完了" calls POST /api/admin/config/complete-setup. On success,
//   it calls a router.push('/admin') (mocked next/navigation).
// - We don't test redirect behavior of next/navigation directly — we assert
//   that the mocked router.push receives '/admin'.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { CompleteStep } from "@/app/setup/steps/CompleteStep";

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

describe("CompleteStep", () => {
  it("clicking 完了 POSTs complete-setup and pushes to /admin on success", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    render(<CompleteStep onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /完了|finish|complete/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/config/complete-setup",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin");
    });
  });

  it("does not redirect on failure", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "error" }, 500));
    render(<CompleteStep onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /完了|finish|complete/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
