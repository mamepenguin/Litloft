import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useInertBackdrop } from "../useInertBackdrop";

/**
 * Mirrors the shape an immersive viewer actually renders into: the viewer is
 * nested inside the page root rather than beside it, so the page it has to
 * neutralise is an ancestor's other subtree, not a sibling of <body>.
 */
function Page({ open }: { open: boolean }) {
  const ref = useInertBackdrop<HTMLDivElement>(open);
  return (
    <div data-testid="app-root">
      <header>
        <button>page control</button>
      </header>
      {open && (
        <div ref={ref} data-testid="viewer">
          <button>viewer control</button>
        </div>
      )}
    </div>
  );
}

function focusableOutsideViewer(): Element[] {
  const viewer = document.querySelector('[data-testid="viewer"]');
  return [...document.querySelectorAll("button")].filter((el) => {
    if (viewer?.contains(el)) return false;
    return !el.closest("[inert]");
  });
}

afterEach(cleanup);

describe("useInertBackdrop", () => {
  it("leaves the page alone while the viewer is closed", () => {
    render(<Page open={false} />);
    expect(focusableOutsideViewer()).toHaveLength(1);
    expect(document.body.style.overflow).toBe("");
  });

  it("puts every control outside the viewer out of reach while open", () => {
    render(<Page open />);
    expect(focusableOutsideViewer()).toEqual([]);
  });

  it("keeps the viewer's own controls reachable", () => {
    const { getByText } = render(<Page open />);
    expect(getByText("viewer control").closest("[inert]")).toBeNull();
  });

  it("locks the body scroll while open", () => {
    render(<Page open />);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("gives the page and the scroll back on close", () => {
    const { rerender } = render(<Page open />);
    rerender(<Page open={false} />);
    expect(focusableOutsideViewer()).toHaveLength(1);
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });

  it("does not clear inert that something else set", () => {
    const outsider = document.createElement("div");
    outsider.setAttribute("inert", "");
    document.body.appendChild(outsider);

    const { rerender } = render(<Page open />);
    rerender(<Page open={false} />);

    expect(outsider.hasAttribute("inert")).toBe(true);
    outsider.remove();
  });
});
