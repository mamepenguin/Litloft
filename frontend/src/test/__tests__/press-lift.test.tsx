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
 * Deleting the hook outright does fail other files in default order — the
 * two halves are not equally held. Weaken it instead of removing it, so
 * that it still ends the press and no longer abandons the swallow (a
 * `pointerup`), and **this file is the only failure in the suite**. The
 * press-ending half has pins elsewhere; the swallow-abandoning half has
 * this one. And the pins elsewhere are accidents of the same kind the
 * sweep just took away from `ContextMenu` — a test that only passes
 * because a leak reached it — so they are not a reason to trust that half
 * either.
 *
 * `storage-shim.test.ts` is the precedent: two of the things `setup.ts`
 * installs have a file that fails when they go, and this is the second.
 *
 * ## Why two identical tests
 *
 * The claim is about what survives *between* tests, so it needs two of
 * them: one leaves the trap, the next reads it. Under `--sequence.shuffle`
 * the order inside a file is shuffled too, so neither can be "the first"
 * by name. Both are written the same way — read the trap if there is one,
 * then set a fresh one — so whichever runs second is the one that
 * measures, in either order, and the other passes having only set the
 * trap. Never a false green **in a run that collects both tests**, which
 * is every run either CI job makes: the check is skipped only when there
 * is nothing yet to check. Filtered locally to one of them (`-t`, or an
 * `it.only` on either) it reports `1 passed | 1 skipped` and pins
 * nothing — vitest says so in that line, and the absolute the sentence
 * used to claim was not something this shape can support.
 *
 * jsdom lays nothing out and hit-tests nothing. Every claim here is about
 * event dispatch and module state, which is what the hook is.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { DismissScrim } from "@/components/DismissScrim";

/**
 * Every scope a listener can take, built rather than listed.
 *
 * The registration below is the cross product of these two, so no single
 * scope has a line of its own: `window-bubble` can only leave the
 * population by taking `window` out of `TARGETS`, which takes a positively
 * asserted arrival with it. The phase axis is the cheaper way out —
 * deleting `bubble: false` costs only `document-bubble`'s `true` — and
 * what survives that is not the product but
 * `expect(teardown).toEqual(...)`, which reads `bubbles` off the event. The previous shape listed the four
 * registrations by hand and named only three of them in an expectation, so
 * the fourth — the one carrying the whole bubbling guard — could be
 * deleted with its `const` and nothing disagreed. That is detector rule
 * 5's "a deletion removes the element from both sides at once", and this
 * is the answer to it: the two sides are built differently, so they cannot
 * be edited together by accident.
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
 * Whether the teardown event arrives at each scope, declared per scope.
 *
 * A value, not a presence: `false` is a statement, where an absence from a
 * list is indistinguishable from a listener nobody registered. The keys
 * are checked against the generated scopes, so this table cannot lose a
 * row on its own either.
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

/** The arrivals, in the order the path produces them. */
const REACHED = ["window-capture", "document-capture", "document-bubble"];

/** The same scopes under an event that *does* bubble: one more, last. */
const REACHED_WHEN_BUBBLING = [
  "window-capture",
  "document-capture",
  "document-bubble",
  "window-bubble",
];

/**
 * What the teardown event was, read as it arrived.
 *
 * Three properties in one record, compared against one declared literal —
 * which is how the ordering claim is held now. It used to be a label
 * pushed by a helper component and matched by the last entry of `REACHED`:
 * a pair, with an unused component, an unused helper and an unused import
 * dangling off it, so the tidy-up that removes them takes the claim with
 * them and every check stays green. That is the shape this file was built
 * to answer, in the file itself.
 *
 * A record is not immune to being edited on both sides at once — nothing
 * is; a declared expectation always can be. What it removes is the *pull*
 * to do it: drop `treeStillMounted` from either side alone and the
 * comparison disagrees, there is nothing left over for a linter to call
 * unused, and the value comes from the DOM at the moment of the event
 * rather than from a helper written to be observed.
 */
interface TeardownEvent {
  type: string;
  bubbles: boolean;
  /**
   * Whether the tree the test rendered was still in the document.
   *
   * This is the ordering claim as a value: vitest calls `afterEach` hooks
   * in reverse registration order and Testing Library's auto-cleanup is
   * registered by the import at the top of `setup.ts`, so the hook runs
   * first and the event lands on a mounted tree. Harmless while
   * `DismissScrim` is the only thing answering a document-level
   * `pointercancel` — and an act warning in a file whose author changed
   * nothing the day something else does.
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
  // The event itself, kept from the one listener that is certain to see
  // it: whether it bubbles is the mechanism the scope table only describes
  // the consequence of. This depends on exactly one registration —
  // `document-capture` — and says so loudly if that scope leaves the
  // product, because `teardown` is then null and the comparison below
  // reports it.
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

  // Then the event itself, whole. `bubbles` decides the scope question —
  // a non-bubbling event's path stops at its target — and
  // `treeStillMounted` is the ordering claim, both read at the moment it
  // arrived rather than inferred from who did or did not answer.
  expect(left.teardown()).toEqual({
    type: "pointercancel",
    bubbles: false,
    treeStillMounted: true,
  });

  // And where it went. The declared table is checked against the scopes
  // that exist, then against what happened, so neither side can shrink
  // quietly.
  expect(Object.keys(ARRIVES).sort()).toEqual(SCOPES.map((s) => s.label).sort());
  expect(REACHED).toEqual(
    SCOPES.filter(({ label }) => ARRIVES[label]).map(({ label }) => label),
  );
  expect(left.seen).toEqual(REACHED);

  // One bubbling probe, as the positive control: the scope the teardown
  // event does not reach is one a listener *is* registered at, and this is
  // what says so. `usePlayerGestures` follows a scrub there, and ending it
  // during teardown would run a drag-end handler on a tree Testing Library
  // has not unmounted yet.
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
