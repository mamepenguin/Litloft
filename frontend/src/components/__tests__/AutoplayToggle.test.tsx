import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AutoplayToggle } from "../AutoplayToggle";

describe("AutoplayToggle", () => {
  it("renders with OFF label by default", () => {
    render(<AutoplayToggle />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("自動再生 OFF");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles label and aria-pressed on click", () => {
    render(<AutoplayToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button.textContent).toContain("自動再生 ON");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(button.textContent).toContain("自動再生 OFF");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});
