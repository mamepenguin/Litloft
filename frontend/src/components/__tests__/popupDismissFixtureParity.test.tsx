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
 * Every event a *touch* produces, in the order the browser produces them.
 * The compatibility mouse events come after `touchend`, not before it.
 */
const A_TAP = [
  "pointerDown",
  "touchStart",
  "pointerUp",
  "touchEnd",
  "mouseDown",
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
  it("knows every event a tap produces", () => {
    expect([...A_TAP]).toEqual([
      "pointerDown",
      "touchStart",
      "pointerUp",
      "touchEnd",
      "mouseDown",
      "mouseUp",
      "click",
    ]);
  });

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
    // Not merely equal to each other: both sides could drift to "auto"
    // together.
    expect(SPEC.scrimPointerEvents).toBe("none");
  });

  it("dismisses on the event the fixture dismisses on, and on no other", () => {
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
    expect(swallowAt).toBe(A_TAP.length - 1);
  });
});
