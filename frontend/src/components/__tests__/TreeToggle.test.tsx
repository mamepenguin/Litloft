import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";

import { TreeToggle } from "../TreeToggle";

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
});

afterEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
});

describe("TreeToggle", () => {
  it("renders an unpressed button when tree is off", () => {
    render(<TreeToggle drive="work" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAttribute("aria-label", "Show tree");
  });

  it("renders a pressed button when tree is on", () => {
    treeEnabledStore.set("work", true);
    render(<TreeToggle drive="work" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveAttribute("aria-label", "Hide tree");
  });

  it("clicking toggles the tree state", () => {
    render(<TreeToggle drive="work" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(treeEnabledStore.get("work")).toBe(true);
    expect(btn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(btn);
    expect(treeEnabledStore.get("work")).toBe(false);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("renders nothing when visible=false", () => {
    const { container } = render(<TreeToggle drive="work" visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("each drive's tree state is independent", () => {
    treeEnabledStore.set("photos", true);
    render(<TreeToggle drive="work" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });
});
