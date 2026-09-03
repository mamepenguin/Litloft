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
        <button>thumbnail</button>
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
    expect(focusableOutsideViewer()).toHaveLength(2);
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
    expect(focusableOutsideViewer()).toHaveLength(2);
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelectorAll("[inert]")).toHaveLength(0);
  });

  it("moves focus into the viewer so Tab starts there", () => {
    const { getByTestId } = render(<Page open />);
    expect(document.activeElement).toBe(getByTestId("viewer"));
    expect(getByTestId("viewer")).toHaveAttribute("tabindex", "-1");
  });

  it("returns focus to whatever opened it", () => {
    const { getByText, rerender } = render(<Page open={false} />);
    const opener = getByText("thumbnail") as HTMLButtonElement;
    opener.focus();
    expect(document.activeElement).toBe(opener);

    rerender(<Page open />);
    expect(document.activeElement).not.toBe(opener);

    rerender(<Page open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it("does not reach for an opener that the close removed from the page", () => {
    function Vanishing({ open }: { open: boolean }) {
      const ref = useInertBackdrop<HTMLDivElement>(open);
      return (
        <div>
          {!open && <button>only while closed</button>}
          {open && <div ref={ref} data-testid="viewer" />}
        </div>
      );
    }
    const { getByText, rerender } = render(<Vanishing open={false} />);
    (getByText("only while closed") as HTMLButtonElement).focus();
    rerender(<Vanishing open />);
    // The opener unmounts on open, so the cleanup has nothing live to restore
    // to; it must not throw on the detached node.
    expect(() => rerender(<Vanishing open={false} />)).not.toThrow();
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
