/**
 * `setup.ts` dispatches a `pointercancel` after every test because
 * `DismissScrim` keeps two pieces of module-scope state across a file: a
 * press in flight, and an armed click-swallow. A test that presses without
 * lifting leaves both, and the next test in the same file pays — a popup
 * mounted then arms a swallow for a press that ended before it, and a
 * plain `fireEvent.click` can be eaten outright.
 *
 * The claim is about what survives *between* tests, so it needs two
 * identical ones: under `--sequence.shuffle` neither can be "the first" by
 * name, so whichever runs second is the one that measures. Filtered to one
 * of them it pins nothing.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { DismissScrim } from "@/components/DismissScrim";

/**
 * Every scope a listener can take, built as a cross product rather than
 * listed, so no single scope can be deleted along with its expectation.
 */
const TARGETS: Record<string, EventTarget> = { window, document };
const PHASES: Record<string, boolean> = { capture: true, bubble: false };

const SCOPES = Object.entries(TARGETS).flatMap(([where, target]) =>
  Object.entries(PHASES).map(([phase, capture]) => ({
    label: `${where}-${phase}`,
    target,
    capture,
  })),
);

/**
 * A value, not a presence: `false` is a statement, where an absence from a
 * list is indistinguishable from a listener nobody registered.
 *
 * `setup.ts` dispatches a non-bubbling `Event` at `document`: the capture
 * path runs `window` → `document`, the target's own listeners run in both
 * phases, and the bubble path — where `usePlayerGestures` follows a scrub
 * on `window` — never starts.
 */
const ARRIVES: Record<string, boolean> = {
  "window-capture": true,
  "window-bubble": false,
  "document-capture": true,
  "document-bubble": true,
};

const REACHED = ["window-capture", "document-capture", "document-bubble"];

const REACHED_WHEN_BUBBLING = [
  "window-capture",
  "document-capture",
  "document-bubble",
  "window-bubble",
];

interface TeardownEvent {
  type: string;
  bubbles: boolean;
  /**
   * Vitest calls `afterEach` hooks in reverse registration order and
   * Testing Library's auto-cleanup is registered by the import at the top
   * of `setup.ts`, so the hook runs first and the event lands on a mounted
   * tree.
   */
  treeStillMounted: boolean;
}

interface Trap {
  seen: string[];
  teardown: () => TeardownEvent | null;
  off: () => void;
  page: HTMLButtonElement;
  clicks: () => number;
}

let trap: Trap | null = null;

/** A control on the page, and a swallow armed against it. */
function setTrap(): void {
  const seen: string[] = [];
  let teardown: TeardownEvent | null = null;
  const handlers = SCOPES.map(({ target, label, capture }) => {
    const fn = (e: Event) => {
      if (label === "document-capture") {
        teardown ??= {
          type: e.type,
          bubbles: e.bubbles,
          treeStillMounted: view.container.isConnected,
        };
      }
      seen.push(label);
    };
    target.addEventListener("pointercancel", fn, capture);
    return () => target.removeEventListener("pointercancel", fn, capture);
  });

  const page = document.createElement("button");
  let clicks = 0;
  page.addEventListener("click", () => {
    clicks += 1;
  });
  document.body.appendChild(page);

  // A popup, dismissed by pressing the page: that press arms the swallow
  // for the click it will produce, and leaves itself in flight. Both are
  // the state this file is about, and neither is cleared by anything the
  // test does.
  const view = render(
    <DismissScrim onDismiss={vi.fn()}>
      <div role="menu">row</div>
    </DismissScrim>,
  );
  fireEvent.pointerDown(page);

  trap = {
    seen,
    teardown: () => teardown,
    off: () => handlers.forEach((remove) => remove()),
    page,
    clicks: () => clicks,
  };
}

/** What the hook must have done to it before this test started. */
function readTrap(left: Trap): void {
  // What the hook is for, first: the swallow the previous test armed was
  // abandoned, so a click reaches the page with its default action intact.
  expect(fireEvent.click(left.page)).toBe(true);
  expect(left.clicks()).toBe(1);

  // And no press is in flight, so a popup mounting now arms nothing.
  render(
    <DismissScrim onDismiss={vi.fn()}>
      <div role="menu">row</div>
    </DismissScrim>,
  );
  fireEvent.click(left.page);
  expect(left.clicks()).toBe(2);

  expect(left.teardown()).toEqual({
    type: "pointercancel",
    bubbles: false,
    treeStillMounted: true,
  });

  expect(Object.keys(ARRIVES).sort()).toEqual(SCOPES.map((s) => s.label).sort());
  expect(REACHED).toEqual(
    SCOPES.filter(({ label }) => ARRIVES[label]).map(({ label }) => label),
  );
  expect(left.seen).toEqual(REACHED);

  // One bubbling probe, as the positive control: the scope the teardown
  // event does not reach is one a listener *is* registered at.
  document.dispatchEvent(new Event("pointercancel", { bubbles: true }));
  expect(left.seen).toEqual([...REACHED, ...REACHED_WHEN_BUBBLING]);

  left.off();
  left.page.remove();
  trap = null;
}

describe("a gesture left open by a test", () => {
  it("does not reach the test after it (1 of 2)", () => {
    if (trap) readTrap(trap);
    setTrap();
  });

  it("does not reach the test after it (2 of 2)", () => {
    if (trap) readTrap(trap);
    setTrap();
  });
});
