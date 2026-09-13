// The global next-intl mock falls back to the dotted key path for a missing
// key, so each query accepts either the localized text or that path.

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
    const heading =
      screen.queryByRole("heading", { name: /welcome/i }) ??
      screen.queryByRole("heading", { name: /setup\.welcome\.greeting/i });
    expect(heading).not.toBeNull();
  });

  it("renders the intro copy", () => {
    render(<WelcomeStep onNext={vi.fn()} onBack={vi.fn()} />);
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
