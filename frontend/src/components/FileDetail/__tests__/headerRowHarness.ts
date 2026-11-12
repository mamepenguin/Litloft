/**
 * Shared by the suites that render a file page inside the real `AppShell`
 * (SPEC-CORE-094, SPEC-CORE-095). The `vi.mock` lines stay in each suite.
 */
import { act, screen } from "@testing-library/react";

import { inspectorOpenStore } from "@/lib/inspectorOpenStore";

const px = (query: string, re: RegExp): number | null => {
  const m = query.match(re);
  return m ? parseFloat(m[1]) : null;
};

/**
 * Answers any width query against `window.innerWidth`, whichever form the
 * code under test writes it in, so the narrow / wide split is the viewport's
 * and not the query's.
 */
export function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const w = window.innerWidth;
      const min = px(query, /min-width:\s*([\d.]+)px/);
      const max = px(query, /max-width:\s*([\d.]+)px/);
      const matches =
        (min !== null || max !== null) &&
        (min === null || w >= min) &&
        (max === null || w <= max);
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
}

export function setWidth(width: number): void {
  act(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: width,
    });
    inspectorOpenStore.notifyViewportChange();
    window.dispatchEvent(new Event("resize"));
  });
}

export const appHeader = (): HTMLElement => screen.getByRole("banner");

/** Everything the shell draws below its header. */
export const belowHeader = (): HTMLElement => {
  const main = document.querySelector("main");
  if (!main) throw new Error("AppShell drew no <main>");
  return main as HTMLElement;
};

export const linksTo = (root: ParentNode, href: string): HTMLAnchorElement[] =>
  [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
    (a) => a.getAttribute("href") === href,
  );
