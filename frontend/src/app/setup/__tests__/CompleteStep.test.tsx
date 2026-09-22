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

const DEFAULT_SUMMARY = {
  driveCount: 1,
  accessMode: "public" as const,
  addonOnCount: 0,
};

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
    render(<CompleteStep onBack={vi.fn()} setupToken="t" summary={DEFAULT_SUMMARY} />);
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

  it("submit button shows a resolved label, not a raw i18n key", async () => {
    render(<CompleteStep onBack={vi.fn()} setupToken="t" summary={DEFAULT_SUMMARY} />);
    const buttons = screen.getAllByRole("button");
    const submit = buttons[buttons.length - 1];
    expect(submit.textContent?.trim()).toBe("Save and finish");
    expect(submit.textContent ?? "").not.toMatch(/setup\./);
  });

  it("does not redirect on failure", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "error" }, 500));
    render(<CompleteStep onBack={vi.fn()} setupToken="t" summary={DEFAULT_SUMMARY} />);
    fireEvent.click(screen.getByRole("button", { name: /完了|finish|complete/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("CompleteStep summary card", () => {
  it("renders driveCount value", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        setupToken="t"
        summary={{ driveCount: 3, accessMode: "public", addonOnCount: 0 }}
      />,
    );
    expect(screen.getByText(/\b3\b/)).toBeInTheDocument();
  });

  it("renders public-mode label when accessMode='public'", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        setupToken="t"
        summary={{ driveCount: 1, accessMode: "public", addonOnCount: 0 }}
      />,
    );
    expect(screen.getByText(/全公開|public/i)).toBeInTheDocument();
  });

  it("renders protected-mode label when accessMode='protected'", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        setupToken="t"
        summary={{ driveCount: 1, accessMode: "protected", addonOnCount: 0 }}
      />,
    );
    expect(screen.getByText(/パスワード保護|protected/i)).toBeInTheDocument();
  });

  it("renders addonOnCount value", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        setupToken="t"
        summary={{ driveCount: 1, accessMode: "public", addonOnCount: 2 }}
      />,
    );
    const matches = screen.getAllByText(/\b2\b/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a 'next steps' heading and an ordered list with 3 items", () => {
    const { container } = render(
      <CompleteStep
        onBack={vi.fn()}
        setupToken="t"
        summary={{ driveCount: 1, accessMode: "public", addonOnCount: 0 }}
      />,
    );
    const heading =
      screen.queryByText(/次の手順|完了ボタン|next step/i) ??
      screen.queryByText(/setup\.complete\.nextStepsTitle/i);
    expect(heading).not.toBeNull();

    const ols = container.querySelectorAll("ol");
    const matchedOl = Array.from(ols).find(
      (ol) => ol.querySelectorAll("li").length === 3,
    );
    expect(matchedOl).toBeDefined();
  });
});
