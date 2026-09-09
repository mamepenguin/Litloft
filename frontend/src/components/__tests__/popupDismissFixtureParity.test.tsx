/**
 * The layout fixture's scrim, against the component it copies.
 *
 * `e2e-layout/popup-dismiss.spec.ts` measures what a dismissing tap does
 * to the control underneath, and it can only measure the markup in front
 * of it — markup that file's fixture writes itself, with listeners of its
 * own. Change `DismissScrim` back to `onPointerDown` and every case there
 * stays green, because the fixture never asked the component anything.
 *
 * This is what asks. Two claims, because the fixture makes two:
 *
 *  - `scrimClass` is the box. Compared whole and in both directions
 *    against `MENU_SCRIM`, so a class dropped from either side is red —
 *    if the scrim stops being `fixed inset-0` the browser cases are
 *    measuring a box that covers nothing.
 *  - `dismissEvent` is the mechanism. Asserted by *driving the component*
 *    with that event and with each of the earlier ones, rather than by
 *    comparing a string to a string: what has to hold is that the
 *    component answers the one the fixture wires up and none of the
 *    others.
 *
 * jsdom lays nothing out and hit-tests nothing, so nothing here is
 * evidence about what a tap reaches. That is the browser spec's, and this
 * is what connects the two.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
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
 * Every pointer event that precedes the tap's `click`.
 *
 * The fixture may wire exactly one of these, and it must be the last one
 * — the click. Listed rather than counted so that a browser adding a new
 * one leaves this table visibly short rather than silently narrower.
 */
const BEFORE_THE_CLICK = [
  "pointerDown",
  "touchStart",
  "mouseDown",
  "pointerUp",
  "touchEnd",
  "mouseUp",
] as const;

describe("the popup-dismiss fixture", () => {
  it("draws the scrim the component draws", () => {
    render(<DismissScrim onDismiss={vi.fn()} />);
    expect(openScrim().className).toBe(SPEC.scrimClass);
    expect(SPEC.scrimClass).toBe(MENU_SCRIM);
  });

  it("wires the event the component answers", () => {
    const onDismiss = vi.fn();
    render(<DismissScrim onDismiss={onDismiss} />);
    fireEvent[SPEC.dismissEvent as "click"](openScrim());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("re-aims the right-click the same way the component does", async () => {
    // The fixture writes its own contextmenu handler, so the browser
    // spec's retarget cases would stay green if the component went back
    // to swallowing. This is what stops that: the fixture declares which
    // of the two it copies, and the component is driven to confirm it
    // does that.
    expect(SPEC.contextMenuBehaviour).toBe("retarget");

    const beneath = document.createElement("div");
    document.body.appendChild(beneath);
    const retargeted = vi.fn();
    beneath.addEventListener("contextmenu", retargeted);
    (document as unknown as { elementFromPoint: unknown }).elementFromPoint =
      () => beneath;

    render(<DismissScrim onDismiss={vi.fn()} retargetOnContextMenu />);
    const prevented = fireEvent.contextMenu(openScrim(), {
      clientX: 40,
      clientY: 60,
    });

    expect(prevented).toBe(false);
    await waitFor(() => expect(retargeted).toHaveBeenCalledTimes(1));

    delete (document as unknown as { elementFromPoint?: unknown })
      .elementFromPoint;
    beneath.remove();
  });

  it("wires none of the events that come before it", () => {
    for (const event of BEFORE_THE_CLICK) {
      expect(
        SPEC.dismissEvent.toLowerCase(),
        `the fixture dismisses on ${event}, which is the defect it is measuring`,
      ).not.toBe(event.toLowerCase());

      const onDismiss = vi.fn();
      const view = render(<DismissScrim onDismiss={onDismiss} />);
      fireEvent[event](openScrim());
      expect(onDismiss, `${event} must not dismiss`).not.toHaveBeenCalled();
      view.unmount();
    }
  });
});
