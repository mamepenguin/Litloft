/**
 * The layout fixture's mechanism, against the component it copies.
 *
 * `e2e-layout/popup-dismiss.spec.ts` measures what a dismissing tap does
 * to the control underneath, at four stacking arrangements — and it can
 * only measure the markup in front of it, which that file's fixture writes
 * itself, with listeners of its own. Change `DismissScrim` back to closing
 * on the scrim's click and every case there stays green, because the
 * fixture never asked the component anything.
 *
 * This is what asks. The fixture declares its mechanism as data, and each
 * declaration is checked by *driving the component* rather than by
 * comparing one string to another:
 *
 *  - `scrimClass` is the box, compared whole and in both directions
 *    against `MENU_SCRIM`.
 *  - `scrimPointerEvents` is the claim that the scrim is appearance. If
 *    the component started intercepting again, the fixture's page would
 *    stop being the page the browser cases think they are measuring.
 *  - `dismissOn` is what closes the popup: fired at the component, and
 *    every earlier and later event in a tap fired too, so what is pinned
 *    is that this one and no other does it.
 *  - `swallows` is the second half: after `dismissOn`, an event of this
 *    type must not reach a listener on the page.
 *
 * jsdom lays nothing out and hit-tests nothing. Nothing here is evidence
 * about which element a tap reaches — under this mechanism nothing needs
 * to be, and the browser spec measures the outcome under real stacking.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { DismissScrim, MENU_SCRIM } from "@/components/DismissScrim";
import { openScrim } from "@/__tests__/helpers/dismissScrim";

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../e2e-layout/fixtures/popup-dismiss.html",
);

const SPEC: Record<string, string> = JSON.parse(
  readFileSync(FIXTURE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

/**
 * Every pointer event in a tap, in the order a browser produces them.
 *
 * Listed rather than counted so that a browser adding a new one leaves
 * this table visibly short rather than silently narrower. The fixture may
 * dismiss on exactly one of these, and the component must agree.
 */
const A_TAP = [
  "pointerDown",
  "touchStart",
  "mouseDown",
  "pointerUp",
  "touchEnd",
  "mouseUp",
  "click",
] as const;

/**
 * The fixture names DOM event types (`pointerdown`); Testing Library's
 * `fireEvent` is keyed by the React spelling (`pointerDown`). Resolved
 * through `A_TAP` rather than by a second table, so an event that is not
 * part of a tap cannot be fired here at all.
 */
function firing(type: string): (typeof A_TAP)[number] {
  const found = A_TAP.find((e) => e.toLowerCase() === type.toLowerCase());
  if (!found) throw new Error(`${type} is not an event a tap produces`);
  return found;
}

function Popup(): React.ReactElement {
  return <div role="menu">row</div>;
}

describe("the popup-dismiss fixture", () => {
  it("draws the scrim the component draws", () => {
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    expect(openScrim().className).toBe(SPEC.scrimClass);
    expect(SPEC.scrimClass).toBe(MENU_SCRIM);
  });

  it("keeps the scrim out of the way, as the component does", () => {
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    expect(openScrim().style.pointerEvents).toBe(SPEC.scrimPointerEvents);
    // Not merely equal to each other: the value has to be the one that
    // makes the scrim untouchable, or both sides could drift to
    // "auto" together and the browser page would be measuring the old
    // mechanism under the new name.
    expect(SPEC.scrimPointerEvents).toBe("none");
  });

  it("dismisses on the event the fixture dismisses on, and on no other", () => {
    // Driven, not compared: what has to hold is that the component
    // answers the one the fixture wires up. Every other event in a tap is
    // fired at a fresh mount and must leave the popup alone — the press
    // shapes because they would close before the click, `click` itself
    // because a scrim that waited for it is the mechanism this replaced.
    for (const event of A_TAP) {
      const onDismiss = vi.fn();
      const view = render(
        <DismissScrim onDismiss={onDismiss}>
          <Popup />
        </DismissScrim>,
      );
      const outside = document.createElement("button");
      document.body.appendChild(outside);

      fireEvent[event](outside);

      const wanted = event.toLowerCase() === SPEC.dismissOn.toLowerCase();
      expect(onDismiss.mock.calls.length, `${event} on the page`).toBe(
        wanted ? 1 : 0,
      );
      view.unmount();
      outside.remove();
    }
  });

  it("swallows the event the fixture swallows", () => {
    const onDismiss = vi.fn();
    render(
      <DismissScrim onDismiss={onDismiss}>
        <Popup />
      </DismissScrim>,
    );
    const outside = document.createElement("button");
    const reached = vi.fn();
    outside.addEventListener(SPEC.swallows, reached);
    document.body.appendChild(outside);

    fireEvent[firing(SPEC.dismissOn)](outside);
    fireEvent[firing(SPEC.swallows)](outside);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(reached).not.toHaveBeenCalled();
    outside.remove();
  });

  it("names events a browser produces, in the order it produces them", () => {
    // The two declarations are positions in one sequence, and the whole
    // point is that the swallowed one comes *after* the one that
    // dismisses. Swap them in the fixture and it is measuring a shape
    // nothing in the tree has.
    const dismissAt = A_TAP.findIndex(
      (e) => e.toLowerCase() === SPEC.dismissOn.toLowerCase(),
    );
    const swallowAt = A_TAP.findIndex(
      (e) => e.toLowerCase() === SPEC.swallows.toLowerCase(),
    );
    expect(dismissAt, `${SPEC.dismissOn} is not an event a tap produces`).not.toBe(
      -1,
    );
    expect(swallowAt, `${SPEC.swallows} is not an event a tap produces`).not.toBe(
      -1,
    );
    expect(swallowAt).toBeGreaterThan(dismissAt);
    // And the swallowed one is the last of them: nothing a browser sends
    // after a click needs taking, and if something did, this list would
    // have to say so first.
    expect(swallowAt).toBe(A_TAP.length - 1);
  });
});
