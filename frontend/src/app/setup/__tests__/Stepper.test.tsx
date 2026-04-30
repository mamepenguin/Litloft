// Stepper test (RED phase)
//
// Choices:
// - Stepper is a presentational component for the wizard progress.
// - Props: `steps: Array<{ id: string; label: string }>`, `currentIndex: number`.
// - Each step indicator carries one of three visual states by class:
//     completed (i < currentIndex)  -> contains "bg-accent-teal"
//     active    (i === currentIndex)-> contains "bg-accent" and aria-current="step"
//     future    (i > currentIndex)  -> contains "bg-warm-light"
// - Step list is exposed as role="list" with role="listitem" children for a11y.
// - The numeric label of each step is rendered as visible text.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Stepper } from "@/app/setup/components/Stepper";

const PUBLIC_STEPS = [
  { id: "drive", label: "ドライブ" },
  { id: "accessMode", label: "アクセス制御" },
  { id: "addonPolicy", label: "アドオン" },
  { id: "complete", label: "完了" },
];

const PROTECTED_STEPS = [
  { id: "drive", label: "ドライブ" },
  { id: "accessMode", label: "アクセス制御" },
  { id: "password", label: "パスワード" },
  { id: "addonPolicy", label: "アドオン" },
  { id: "complete", label: "完了" },
];

describe("Stepper", () => {
  it("renders the labels of all provided steps", () => {
    render(<Stepper steps={PUBLIC_STEPS} currentIndex={0} />);
    expect(screen.getByText("ドライブ")).toBeInTheDocument();
    expect(screen.getByText("アクセス制御")).toBeInTheDocument();
    expect(screen.getByText("アドオン")).toBeInTheDocument();
    expect(screen.getByText("完了")).toBeInTheDocument();
  });

  it("renders 4 items for the public mode (no password step)", () => {
    render(<Stepper steps={PUBLIC_STEPS} currentIndex={0} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
  });

  it("renders 5 items for the protected mode (with password step)", () => {
    render(<Stepper steps={PROTECTED_STEPS} currentIndex={0} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
  });

  it("exposes the items inside a role=list container", () => {
    render(<Stepper steps={PUBLIC_STEPS} currentIndex={0} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("marks the first step active when currentIndex=0 and others future", () => {
    const { container } = render(
      <Stepper steps={PUBLIC_STEPS} currentIndex={0} />,
    );

    // The active item should have aria-current="step" and an indicator with bg-accent.
    const active = container.querySelector('[aria-current="step"]');
    expect(active).not.toBeNull();
    expect(active!.innerHTML).toContain("bg-accent");

    // No element should be marked completed (no bg-accent-teal indicator).
    expect(container.innerHTML).not.toContain("bg-accent-teal");

    // Remaining indicators should be future (bg-warm-light) — at least 3.
    const futureMatches = container.innerHTML.match(/bg-warm-light/g) ?? [];
    expect(futureMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("marks intermediate index correctly: completed / active / future", () => {
    // currentIndex=2 of 4 steps  ->  [completed, completed, active, future]
    const { container } = render(
      <Stepper steps={PUBLIC_STEPS} currentIndex={2} />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);

    // Indices 0 and 1 should be completed (bg-accent-teal), no aria-current.
    expect(items[0].getAttribute("aria-current")).toBeNull();
    expect(items[0].innerHTML).toContain("bg-accent-teal");
    expect(items[1].getAttribute("aria-current")).toBeNull();
    expect(items[1].innerHTML).toContain("bg-accent-teal");

    // Index 2 should be active (bg-accent + aria-current).
    expect(items[2].getAttribute("aria-current")).toBe("step");
    expect(items[2].innerHTML).toContain("bg-accent");

    // Index 3 should be future (bg-warm-light, no aria-current).
    expect(items[3].getAttribute("aria-current")).toBeNull();
    expect(items[3].innerHTML).toContain("bg-warm-light");
  });

  it("marks the last step active when currentIndex points to it", () => {
    const lastIdx = PROTECTED_STEPS.length - 1;
    const { container } = render(
      <Stepper steps={PROTECTED_STEPS} currentIndex={lastIdx} />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);

    // All but last are completed.
    for (let i = 0; i < lastIdx; i++) {
      expect(items[i].getAttribute("aria-current")).toBeNull();
      expect(items[i].innerHTML).toContain("bg-accent-teal");
    }

    // Last is active.
    expect(items[lastIdx].getAttribute("aria-current")).toBe("step");
    expect(items[lastIdx].innerHTML).toContain("bg-accent");

    // No future indicator (bg-warm-light) at all.
    expect(container.innerHTML).not.toContain("bg-warm-light");
  });

  it("only has exactly one element with aria-current=step", () => {
    const { container } = render(
      <Stepper steps={PROTECTED_STEPS} currentIndex={1} />,
    );
    const currents = container.querySelectorAll('[aria-current="step"]');
    expect(currents.length).toBe(1);
  });
});
