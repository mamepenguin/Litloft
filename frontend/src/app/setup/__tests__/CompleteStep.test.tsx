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
    render(<CompleteStep onBack={vi.fn()} summary={DEFAULT_SUMMARY} />);
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
    // Regression: the button used t('complete') under the "setup"
    // namespace, but setup.complete is an object namespace, so next-intl
    // rendered the literal key path. The label must be a real string and
    // must not leak the "setup." key prefix.
    render(<CompleteStep onBack={vi.fn()} summary={DEFAULT_SUMMARY} />);
    const buttons = screen.getAllByRole("button");
    const submit = buttons[buttons.length - 1];
    expect(submit.textContent?.trim()).toBe("Save and finish");
    expect(submit.textContent ?? "").not.toMatch(/setup\./);
  });

  it("does not redirect on failure", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "error" }, 500));
    render(<CompleteStep onBack={vi.fn()} summary={DEFAULT_SUMMARY} />);
    fireEvent.click(screen.getByRole("button", { name: /完了|finish|complete/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});

// Additional tests (RED phase) for the redesigned CompleteStep summary card.
// These rely on the new `summary` prop, which is required after the
// 2026-04-30 setup-wizard-redesign spec. The summary block must show:
//   - driveCount with localized unit
//   - accessMode label ("全公開" or "パスワード保護")
//   - addonOnCount with localized unit
// In addition, a "next steps" section with three ordered items must render.
describe("CompleteStep summary card", () => {
  it("renders driveCount value", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        summary={{ driveCount: 3, accessMode: "public", addonOnCount: 0 }}
      />,
    );
    // Match "3 件" or "3" (locale unit may live in adjacent text).
    expect(screen.getByText(/\b3\b/)).toBeInTheDocument();
  });

  it("renders public-mode label when accessMode='public'", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        summary={{ driveCount: 1, accessMode: "public", addonOnCount: 0 }}
      />,
    );
    expect(screen.getByText(/全公開|public/i)).toBeInTheDocument();
  });

  it("renders protected-mode label when accessMode='protected'", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        summary={{ driveCount: 1, accessMode: "protected", addonOnCount: 0 }}
      />,
    );
    expect(screen.getByText(/パスワード保護|protected/i)).toBeInTheDocument();
  });

  it("renders addonOnCount value", () => {
    render(
      <CompleteStep
        onBack={vi.fn()}
        summary={{ driveCount: 1, accessMode: "public", addonOnCount: 2 }}
      />,
    );
    // Find a "2" in the rendered output (the addonOnCount value).
    // We assert there is at least one node containing the literal "2".
    const matches = screen.getAllByText(/\b2\b/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a 'next steps' heading and an ordered list with 3 items", () => {
    const { container } = render(
      <CompleteStep
        onBack={vi.fn()}
        summary={{ driveCount: 1, accessMode: "public", addonOnCount: 0 }}
      />,
    );
    // Heading: localized "次の手順" / "完了ボタンを押すと" or fallback key
    // path "setup.complete.nextStepsTitle".
    const heading =
      screen.queryByText(/次の手順|完了ボタン|next step/i) ??
      screen.queryByText(/setup\.complete\.nextStepsTitle/i);
    expect(heading).not.toBeNull();

    // The next-steps list should be an <ol> with 3 <li>.
    const ols = container.querySelectorAll("ol");
    // At least one <ol> with 3 children corresponds to the next-steps list.
    const matchedOl = Array.from(ols).find(
      (ol) => ol.querySelectorAll("li").length === 3,
    );
    expect(matchedOl).toBeDefined();
  });
});
