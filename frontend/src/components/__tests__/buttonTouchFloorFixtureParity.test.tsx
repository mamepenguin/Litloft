/**
 * The touch-floor layout fixture's class-list table, against the two
 * emitters it copies.
 *
 * `e2e-layout/button-touch-floor.spec.ts` measures real boxes in
 * Chromium — 32 / 36 / 40 under a fine pointer, 44 under a coarse one —
 * and a browser suite can only see what the markup in front of it
 * produces. There the class lists *are* the measurement: the fixture
 * writes them out itself, so deleting `TOUCH_FLOOR_CLASS` from
 * `Button.tsx` leaves every case over there green, measuring a button
 * this app does not have.
 *
 * So this is the guard, and it is a parity test rather than one table
 * read twice: the fixture declares its class lists as JSON inside the
 * page, and everything below comes from **rendering the component** and
 * **calling `buttonClass()`**.
 *
 * One render state is declared per row, by name, and each state's output
 * must equal its row exactly — no subset, no token-set flattening. The
 * row names and the state names are then compared as sets. Declared per
 * state rather than collected from the renders, for the reason
 * `justifiedGridFixtureParity.test.tsx` gives at length: an expectation
 * built out of the observation cannot catch a deletion, because the
 * removed element leaves both sides at once (detector rule 5).
 *
 * **What this cannot hold.** jsdom lays nothing out, so nothing here is
 * evidence about a height. It holds that the strings the browser measures
 * are the strings the app ships. The heights are the other file's job.
 *
 * `controls` is deliberately *not* checked against anything: it is the
 * fixed-height counter-example the spec needs in order to be able to fail,
 * and the app emits no such class list. It is asserted to be exactly that one
 * entry, so a shape cannot be quietly parked there to escape this table.
 */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Button, buttonClass } from "../Button";

afterEach(cleanup);

const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "e2e-layout",
  "fixtures",
  "button-touch-floor.html",
);

interface Spec {
  shapes: Record<string, string>;
  controls: Record<string, string>;
  label: string;
  wrappingLabel: string;
  wrapColumnPx: number;
}

const SPEC: Spec = JSON.parse(
  readFileSync(FIXTURE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const normalise = (className: string) =>
  className.split(/\s+/).filter(Boolean).join(" ");

/**
 * The seven states, declared. Each produces one class list, from the
 * real emitter, with the props the fixture's row is meant to be.
 */
const STATES: Record<string, () => string> = {
  buttonSm: () => {
    render(
      <Button variant="secondary" size="sm">
        {SPEC.label}
      </Button>,
    );
    return screen.getByRole("button").getAttribute("class") ?? "";
  },
  buttonMd: () => {
    render(
      <Button variant="secondary" size="md">
        {SPEC.label}
      </Button>,
    );
    return screen.getByRole("button").getAttribute("class") ?? "";
  },
  buttonLg: () => {
    render(
      <Button variant="secondary" size="lg">
        {SPEC.label}
      </Button>,
    );
    return screen.getByRole("button").getAttribute("class") ?? "";
  },
  iconOnly: () => {
    render(
      <Button variant="ghost" iconOnly aria-label="Delete Q1 notes">
        <svg width="18" height="18" />
      </Button>,
    );
    return screen.getByRole("button").getAttribute("class") ?? "";
  },
  linkSm: () => buttonClass({ variant: "secondary", size: "sm" }),
  linkMd: () => buttonClass({ variant: "secondary", size: "md" }),
  linkLg: () => buttonClass({ variant: "secondary", size: "lg" }),
};

describe("the touch-floor fixture copies the emitters exactly", () => {
  it("declares a row for every state and a state for every row", () => {
    expect(Object.keys(SPEC.shapes).sort()).toEqual(Object.keys(STATES).sort());
  });

  it.each(Object.keys(STATES))("%s", (name) => {
    expect(normalise(STATES[name]())).toBe(normalise(SPEC.shapes[name]));
  });

  // The counter-example, and the one thing in the table the app does not
  // emit. Pinned as a whole so nothing else can be added beside it, and
  // pinned against the shape it is a counter-example *to*: it must be
  // `buttonMd` with the floor respelled as a fixed height, or the wrapping
  // case is comparing two boxes that differ in more than the one property.
  //
  // The two class names below are code, not prose, and are sources for
  // those utilities — which is harmless here because both are written by
  // a dozen product files besides this one (`coarseNeedleSources.test.ts`
  // classifies them). Prose in this file names utilities as selectors for
  // the reason `e2e-layout/build-fixture-css.ts` gives.
  it("keeps the fixed-height control a respelling of buttonMd and nothing else", () => {
    expect(Object.keys(SPEC.controls)).toEqual(["wrapClamped"]);
    expect(normalise(SPEC.controls.wrapClamped)).toBe(
      normalise(SPEC.shapes.buttonMd).replace(
        "pointer-coarse:min-h-11",
        "pointer-coarse:h-11",
      ),
    );
  });

  // The label the fixture puts inside the boxes has to wrap in the column
  // it is given, or the `min-h` case measures a box that never overflowed.
  // jsdom cannot lay it out, so what is held here is the premise's inputs:
  // a multi-character CJK label and a column narrower than it.
  it("gives the wrapping case a label that cannot fit its column", () => {
    expect(SPEC.wrapColumnPx).toBe(120);
    expect(SPEC.wrappingLabel.length).toBeGreaterThan(12);
    expect(/[぀-ヿ一-鿿]/.test(SPEC.wrappingLabel)).toBe(true);
  });
});
