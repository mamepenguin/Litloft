/**
 * The touch-floor layout fixture writes its class lists out itself, so the
 * browser suite measures them whatever the app ships; this compares them
 * with the real emitters.
 *
 * `controls` is deliberately *not* checked against anything: it is the
 * fixed-height counter-example the spec needs in order to be able to fail,
 * and the app emits no such class list.
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

  // It must be `buttonMd` with the floor respelled as a fixed height, or the
  // wrapping case compares two boxes that differ in more than one property.
  //
  // The two class names below are Tailwind sources, which is harmless only
  // because product files write both as well.
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
  it("gives the wrapping case a label that cannot fit its column", () => {
    expect(SPEC.wrapColumnPx).toBe(120);
    expect(SPEC.wrappingLabel.length).toBeGreaterThan(12);
    expect(/[぀-ヿ一-鿿]/.test(SPEC.wrappingLabel)).toBe(true);
  });
});
