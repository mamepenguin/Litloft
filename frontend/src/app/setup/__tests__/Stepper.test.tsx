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

    const active = container.querySelector('[aria-current="step"]');
    expect(active).not.toBeNull();
    expect(active!.innerHTML).toContain("bg-accent");

    expect(container.innerHTML).not.toContain("bg-accent-teal");

    const futureMatches = container.innerHTML.match(/bg-warm-light/g) ?? [];
    expect(futureMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("marks intermediate index correctly: completed / active / future", () => {
    // currentIndex=2 of 4 steps  ->  [completed, completed, active, future]
    render(<Stepper steps={PUBLIC_STEPS} currentIndex={2} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);

    expect(items[0].getAttribute("aria-current")).toBeNull();
    expect(items[0].innerHTML).toContain("bg-accent-teal");
    expect(items[1].getAttribute("aria-current")).toBeNull();
    expect(items[1].innerHTML).toContain("bg-accent-teal");

    expect(items[2].getAttribute("aria-current")).toBe("step");
    expect(items[2].innerHTML).toContain("bg-accent");

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

    for (let i = 0; i < lastIdx; i++) {
      expect(items[i].getAttribute("aria-current")).toBeNull();
      expect(items[i].innerHTML).toContain("bg-accent-teal");
    }

    expect(items[lastIdx].getAttribute("aria-current")).toBe("step");
    expect(items[lastIdx].innerHTML).toContain("bg-accent");

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
