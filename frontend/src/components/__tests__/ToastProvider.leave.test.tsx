/**
 * SPEC-CORE-182 I5 / I7 / I8 — a dismissed toast leaves over 150ms, inert and
 * hidden, and nothing about the leave outlives the provider.
 */

import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { ToastProvider, useToast } from "../ToastProvider";

type Api = ReturnType<typeof useToast>;

const handle: { api: Api | null } = { api: null };

function Capture(): null {
  const toast = useToast();
  useEffect(() => {
    handle.api = toast;
  }, [toast]);
  return null;
}

function renderProvider() {
  return render(
    <>
      <input aria-label="outside" />
      <ToastProvider>
        <Capture />
      </ToastProvider>
    </>,
  );
}

function push(message: string, action?: { label: string; onClick: () => void }): void {
  act(() => {
    if (action) handle.api!.success(message, { action });
    else handle.api!.info(message);
  });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** The close button belonging to the toast that shows `message`. */
function closeButtonOf(message: string): HTMLElement {
  let node: HTMLElement | null = screen.getByText(message);
  while (node && node.querySelectorAll('[aria-label="Dismiss"]').length !== 1) {
    node = node.parentElement;
  }
  if (!node) throw new Error(`no close button around ${message}`);
  return node.querySelector<HTMLElement>('[aria-label="Dismiss"]')!;
}

function isLeaving(message: string): boolean {
  const text = screen.queryByText(message);
  if (!text) return false;
  return (
    text.closest("[inert]") !== null && text.closest('[aria-hidden="true"]') !== null
  );
}

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");

beforeEach(() => {
  handle.api = null;
  vi.useFakeTimers();
  delete (Element.prototype as Partial<Element>).animate;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else delete (Element.prototype as Partial<Element>).animate;
});

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("SPEC-CORE-182 I5 a dismissed toast leaves", () => {
  const dismissals = [
    ["its close button", (message: string) => fireEvent.click(closeButtonOf(message))],
    ["its 5 s timer", () => advance(5000)],
    [
      "its action",
      (message: string) => {
        void message;
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      },
    ],
  ] as const;

  it.each(dismissals)(
    "SPEC-CORE-182 I5 stays 150ms inert and aria-hidden after %s, then is removed",
    (_how, dismiss) => {
      renderProvider();
      push("goes", { label: "Undo", onClick: () => {} });

      dismiss("goes");

      expect(isLeaving("goes")).toBe(true);
      advance(149);
      expect(isLeaving("goes")).toBe(true);
      advance(1);
      expect(screen.queryByText("goes")).toBeNull();
    },
  );

  it("SPEC-CORE-182 I5 leaves the other toasts neither inert nor hidden", () => {
    renderProvider();
    push("stays");
    push("goes");
    fireEvent.click(closeButtonOf("goes"));

    expect(isLeaving("goes")).toBe(true);
    const other = screen.getByText("stays");
    expect(other.closest("[inert]")).toBeNull();
    expect(other.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("stays");
  });

  it("SPEC-CORE-182 I5 moves focus held inside the toast to document.body", () => {
    renderProvider();
    push("focused");
    const close = closeButtonOf("focused");
    close.focus();
    expect(close).toHaveFocus();

    fireEvent.click(close);

    expect(isLeaving("focused")).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it("SPEC-CORE-182 I5 leaves focus where the action's onClick put it", () => {
    renderProvider();
    const outside = screen.getByLabelText("outside");
    push("moved", { label: "Undo", onClick: () => outside.focus() });
    const undo = screen.getByRole("button", { name: "Undo" });
    undo.focus();

    fireEvent.click(undo);

    expect(isLeaving("moved")).toBe(true);
    expect(outside).toHaveFocus();
  });

  it("SPEC-CORE-182 I5 counts a second close press during the leave as nothing", () => {
    renderProvider();
    push("twice");
    const close = closeButtonOf("twice");
    fireEvent.click(close);
    advance(100);
    fireEvent.click(close);

    expect(isLeaving("twice")).toBe(true);
    advance(49);
    expect(isLeaving("twice")).toBe(true);
    advance(1);
    expect(screen.queryByText("twice")).toBeNull();
  });

  it("SPEC-CORE-182 I5 lets the 5 s timer firing during the leave change nothing", () => {
    renderProvider();
    push("late");
    advance(4900);
    fireEvent.click(closeButtonOf("late"));
    advance(100);
    expect(isLeaving("late")).toBe(true);
    advance(49);
    expect(isLeaving("late")).toBe(true);
    advance(1);
    expect(screen.queryByText("late")).toBeNull();
  });

  it("SPEC-CORE-182 I5 lets the 5 s timer firing after removal change nothing", () => {
    renderProvider();
    push("early");
    fireEvent.click(closeButtonOf("early"));
    expect(isLeaving("early")).toBe(true);
    advance(150);
    expect(screen.queryByText("early")).toBeNull();
    push("next");
    advance(4900);
    expect(screen.getByRole("status")).toHaveTextContent("next");
    expect(isLeaving("next")).toBe(false);
  });

  it("SPEC-CORE-182 I5 lets a toast leave during its own entrance", () => {
    renderProvider();
    push("brief");
    fireEvent.click(closeButtonOf("brief"));
    expect(isLeaving("brief")).toBe(true);
    advance(150);
    expect(screen.queryByText("brief")).toBeNull();
  });
});

describe("SPEC-CORE-182 I8 the action and the leave", () => {
  it("SPEC-CORE-182 I8 runs the action once, before the toast becomes leaving", () => {
    renderProvider();
    const seen: boolean[] = [];
    const onClick = vi.fn(() => {
      seen.push(isLeaving("acted"));
    });
    push("acted", { label: "Undo", onClick });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([false]);
    expect(isLeaving("acted")).toBe(true);
    advance(150);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("acted")).toBeNull();
  });
});

describe("SPEC-CORE-182 I5 I7 under reduced motion", () => {
  it.each([
    [false, true],
    [true, false],
  ])(
    "SPEC-CORE-182 I5 with reduce=%s, the dismissed toast is still in the DOM right after dismissal: %s",
    (reduced, stillThere) => {
      stubReducedMotion(reduced);
      renderProvider();
      push("quiet");
      fireEvent.click(closeButtonOf("quiet"));
      expect(screen.queryByText("quiet") !== null).toBe(stillThere);
      advance(150);
      expect(screen.queryByText("quiet")).toBeNull();
    },
  );

  it("SPEC-CORE-182 I7 calls Element.animate zero times for toast changes under reduced motion", () => {
    stubReducedMotion(true);
    const animate = vi.fn();
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      writable: true,
      value: animate,
    });
    renderProvider();
    push("one");
    push("two");
    push("three");
    fireEvent.click(closeButtonOf("two"));
    advance(5000);
    advance(150);

    expect(screen.queryByText("one")).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-182 I7 without Element.animate", () => {
  it("SPEC-CORE-182 I7 pushes, leaves and removes toasts without throwing", () => {
    expect(typeof (Element.prototype as Partial<Element>).animate).not.toBe("function");
    renderProvider();
    expect(() => {
      push("a");
      push("b");
      push("c");
      fireEvent.click(closeButtonOf("b"));
    }).not.toThrow();
    expect(isLeaving("b")).toBe(true);
    expect(() => advance(150)).not.toThrow();
    expect(screen.queryByText("b")).toBeNull();
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-182 I8 after the provider unmounts", () => {
  it("SPEC-CORE-182 I8 leaves no toast timer, 5 s or leave, to fire", () => {
    const view = renderProvider();
    const before = vi.getTimerCount();
    push("showing");
    push("leaving");
    fireEvent.click(closeButtonOf("leaving"));
    expect(isLeaving("leaving")).toBe(true);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      view.unmount();
      expect(vi.getTimerCount()).toBe(before);
      advance(10_000);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
