import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Eye, Pencil } from "lucide-react";

import { SegmentedControl } from "../SegmentedControl";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

describe("SegmentedControl", () => {
  it("is a named group of buttons, pressed for exactly the current value", () => {
    render(<SegmentedControl label="Letters" options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Letters" })).not.toBeNull();
    const pressed = OPTIONS.map(
      (o) => screen.getByRole("button", { name: o.label }).getAttribute("aria-pressed"),
    );
    expect(pressed).toEqual(["false", "true", "false"]);
  });

  it("reports an unselected segment once, and the selected one not at all", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Letters" options={OPTIONS} value="b" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    expect(onChange.mock.calls).toEqual([["c"]]);
  });

  it("gives each segment a test id from the prefix and its value", () => {
    render(
      <SegmentedControl label="Letters" options={OPTIONS} value="a" onChange={() => {}} testIdPrefix="letter-" />,
    );
    expect(screen.getByTestId("letter-c").textContent).toBe("Gamma");
  });

  it("names icon segments by their label, as name and tooltip", () => {
    render(
      <SegmentedControl
        label="View"
        iconOnly
        options={[
          { value: "edit", label: "Edit", icon: Pencil },
          { value: "preview", label: "Preview", icon: Eye },
        ]}
        value="preview"
        onChange={() => {}}
      />,
    );
    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit.getAttribute("title")).toBe("Edit");
    expect(edit.textContent).toBe("");
  });

  it("draws an option in the style it brings", () => {
    render(
      <SegmentedControl
        label="Font"
        options={[{ value: "serif", label: "Serif", style: { fontFamily: "Georgia" } }]}
        value="serif"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Serif" }).style.fontFamily).toBe("Georgia");
  });
});
