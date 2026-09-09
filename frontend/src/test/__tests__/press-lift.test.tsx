/**
 * The harness ends the gesture a test leaves open — pinned, not asserted
 * in a comment.
 *
 * `setup.ts` dispatches a `pointercancel` after every test because
 * `DismissScrim` keeps two pieces of module-scope state across a file: a
 * press in flight, and an armed click-swallow. A test that presses without
 * lifting leaves both, and the next test in the same file pays — a popup
 * mounted then arms a swallow for a press that ended before it, and a
 * plain `fireEvent.click` can be eaten outright.
 *
 * Without this file that hook is invisible to the job that gates merges:
 * deleting it leaves the whole suite green in default order, and only
 * `--sequence.shuffle` landing on a seed that reorders two particular
 * tests inside one file notices. `storage-shim.test.ts` is the precedent —
 * `setup.ts` installs two harness mechanisms now, and each has a file that
 * fails when it goes.
 *
 * ## Why two identical tests
 *
 * The claim is about what survives *between* tests, so it needs two of
 * them: one leaves the trap, the next reads it. Under `--sequence.shuffle`
 * the order inside a file is shuffled too, so neither can be "the first"
 * by name. Both are written the same way — read the trap if there is one,
 * then set a fresh one — so whichever runs second is the one that
 * measures, in either order, and the other passes having only set the
 * trap. Never a false green: the check is skipped only when there is
 * nothing yet to check.
 *
 * jsdom lays nothing out and hit-tests nothing. Every claim here is about
 * event dispatch and module state, which is what the hook is.
 */

import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { DismissScrim } from "@/components/DismissScrim";

/**
 * Where the teardown event is expected to arrive, and where it is not.
 *
 * Declared, not collected: the point of the last entry is that it stays
 * absent. `setup.ts` dispatches a non-bubbling `Event` at `document`, so
 * the capture path reaches `window` and `document`, the target's own
 * listeners run in both phases, and a `window` bubble listener — the shape
 * `usePlayerGestures` uses for a scrub — is out of reach. Making the event
 * bubble is a real choice with a real cost, and it fails here rather than
 * silently widening what runs during teardown.
 */
const REACHED = [
  "window-capture",
  "document-capture",
  "document-bubble",
  // Last, and that is the other half of the order: the hook runs *before*
  // Testing Library's `cleanup()`, because vitest calls `afterEach` hooks
  // in reverse registration order and the auto-cleanup is registered by
  // the import at the top of `setup.ts`. So the event lands on a tree that
  // is still mounted. Harmless while `DismissScrim` is the only thing in
  // the tree answering a document-level `pointercancel`; a component that
  // ended a drag on one would run its handler here, outside `act()`.
  "cleanup-unmounted",
];
const NOT_REACHED = "window-bubble";

/** Reports when Testing Library unmounts it, so the order can be read. */
function Unmounts({ onUnmount }: { onUnmount: () => void }): null {
  useEffect(() => onUnmount, [onUnmount]);
  return null;
}

interface Trap {
  seen: string[];
  off: () => void;
  page: HTMLButtonElement;
  clicks: () => number;
}

let trap: Trap | null = null;

/** A control on the page, and a swallow armed against it. */
function setTrap(): void {
  const seen: string[] = [];
  const listeners: Array<[EventTarget, string, boolean]> = [
    [window, "window-capture", true],
    [document, "document-capture", true],
    [document, "document-bubble", false],
    [window, NOT_REACHED, false],
  ];
  const handlers = listeners.map(([target, label, capture]) => {
    const fn = () => seen.push(label);
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
  render(
    <DismissScrim onDismiss={vi.fn()}>
      <div role="menu">
        <Unmounts onUnmount={() => seen.push("cleanup-unmounted")} />
      </div>
    </DismissScrim>,
  );
  fireEvent.pointerDown(page);

  trap = {
    seen,
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

  // Then where the event went, which is the half a comment would otherwise
  // be the only record of.
  expect(left.seen).toEqual(REACHED);

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
