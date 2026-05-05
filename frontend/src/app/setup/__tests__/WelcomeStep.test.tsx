// WelcomeStep test (RED phase)
//
// Choices:
// - WelcomeStep is a localized intro screen between LanguageStep and DriveStep.
// - Props: { onNext: () => void; onBack: () => void }.
// - It uses i18n keys under `setup.welcome.*`. The global next-intl mock in
//   src/test/setup.ts looks values up against messages/en.json; missing keys
//   fall back to the dotted path string (e.g. "setup.welcome.greeting"),
//   which is sufficient to assert structural rendering even before the JSON
//   keys are added.
// - The "5 setup items" must be rendered inside an <ol>.
// - "Back" calls onBack; "Get started" calls onNext.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { WelcomeStep } from "@/app/setup/steps/WelcomeStep";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WelcomeStep", () => {
  it("renders a top-level heading (greeting)", () => {
    render(<WelcomeStep onNext={vi.fn()} onBack={vi.fn()} />);
    // Greeting is the only h1/h2 in this step. We accept either an actual
    // localized greeting (after ja.json is updated) or the fallback key path.
    const heading =
      screen.queryByRole("heading", { name: /welcome/i }) ??
      screen.queryByRole("heading", { name: /setup\.welcome\.greeting/i });
    expect(heading).not.toBeNull();
  });

  it("renders the intro copy", () => {
    render(<WelcomeStep onNext={vi.fn()} onBack={vi.fn()} />);
    // The intro paragraph either contains the localized text or the fallback
    // key path.
    const intro =
      screen.queryByText(/self-host|file/i) ??
      screen.queryByText(/setup\.welcome\.intro/i);
    expect(intro).not.toBeNull();
  });

  it("renders the upcoming-steps list as an ordered list with 5 items", () => {
    const { container } = render(
      <WelcomeStep onNext={vi.fn()} onBack={vi.fn()} />,
    );
    const ol = container.querySelector("ol");
    expect(ol).not.toBeNull();
    const items = ol!.querySelectorAll("li");
    expect(items.length).toBe(5);
  });

  it('has a "back" button that invokes onBack', () => {
    const onBack = vi.fn();
    render(<WelcomeStep onNext={vi.fn()} onBack={onBack} />);
    const backBtn = screen.getByRole("button", { name: /back/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has a primary "start" button that invokes onNext', () => {
    const onNext = vi.fn();
    render(<WelcomeStep onNext={onNext} onBack={vi.fn()} />);
    // Match either the localized "Get started" or the i18n fallback key string.
    const startBtn =
      screen.queryByRole("button", { name: /get started|start|begin/i }) ??
      screen.getByRole("button", { name: /setup\.welcome\.startButton/i });
    fireEvent.click(startBtn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("primary start button is distinct from back button", () => {
    render(<WelcomeStep onNext={vi.fn()} onBack={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    // At minimum: back + start. There may be extras (e.g. language switch),
    // but never less than 2.
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
