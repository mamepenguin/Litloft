import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GHOST_MS,
  showOpenGhost,
  _resetOpenGhostForTests,
} from "../openGhost";

interface FakeAnimation {
  finished: Promise<void>;
  settle: () => void;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
}

let animations: FakeAnimation[] = [];

/** jsdom has no Web Animations API, so the element is given one. */
function installAnimate(): void {
  Element.prototype.animate = function (
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    let settle!: () => void;
    const finished = new Promise<void>((resolve) => {
      settle = () => resolve();
    });
    const record = { finished, settle, frames, options };
    animations.push(record);
    return record as unknown as Animation;
  } as unknown as typeof Element.prototype.animate;
}

function removeAnimate(): void {
  delete (Element.prototype as Partial<Element>).animate;
}

function setReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/** A card whose picture has a size, which jsdom will not work out itself. */
function card(width = 160, height = 90): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = '<img id="thumb" alt="">';
  el.getBoundingClientRect = () =>
    ({ left: 20, top: 40, width, height }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const ghosts = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-open-ghost]"));

beforeEach(() => {
  animations = [];
  document.body.innerHTML = "";
  _resetOpenGhostForTests();
  setReducedMotion(false);
  installAnimate();
});

afterEach(() => {
  removeAnimate();
  _resetOpenGhostForTests();
});

describe("showOpenGhost", () => {
  it("puts a copy of the pressed picture where the picture is", () => {
    showOpenGhost(card());

    expect(ghosts()).toHaveLength(1);
    const ghost = ghosts()[0];
    expect(ghost.style.position).toBe("fixed");
    expect(ghost.style.left).toBe("20px");
    expect(ghost.style.top).toBe("40px");
    expect(ghost.style.width).toBe("160px");
    expect(ghost.style.height).toBe("90px");
  });

  it("takes no presses and is not read out", () => {
    showOpenGhost(card());

    const ghost = ghosts()[0];
    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost).toHaveAttribute("aria-hidden", "true");
  });

  it("carries no id from the card it copied", () => {
    const origin = card();
    origin.id = "card-1";

    showOpenGhost(origin);

    const ghost = ghosts()[0];
    expect(ghost.id).toBe("");
    expect(ghost.querySelector("#thumb")).toBe(null);
    expect(document.querySelectorAll("#thumb")).toHaveLength(1);
  });

  it("grows a fifth and fades right out, in the time declared", () => {
    showOpenGhost(card());

    expect(GHOST_MS).toBe(160);
    expect(animations).toHaveLength(1);
    expect(animations[0].frames).toEqual([
      { transform: "scale(1)", opacity: 0.85 },
      { transform: "scale(1.2)", opacity: 0 },
    ]);
    expect(animations[0].options.duration).toBe(160);
  });

  it("takes itself away when the animation settles", async () => {
    showOpenGhost(card());

    animations[0].settle();
    await Promise.resolve();
    await Promise.resolve();

    expect(ghosts()).toEqual([]);
  });

  it("leaves one copy behind, not a pile, when cards are pressed in a row", () => {
    showOpenGhost(card());
    showOpenGhost(card());
    showOpenGhost(card());

    expect(ghosts()).toHaveLength(1);
  });

  it("shows nothing under prefers-reduced-motion", () => {
    setReducedMotion(true);

    showOpenGhost(card());

    expect(ghosts()).toEqual([]);
  });

  it("shows nothing for a card with no box to copy", () => {
    showOpenGhost(card(0, 0));

    expect(ghosts()).toEqual([]);
  });

  it("shows nothing when there is no card", () => {
    showOpenGhost(null);

    expect(ghosts()).toEqual([]);
  });

  it("leaves nothing behind where the browser cannot animate", () => {
    removeAnimate();

    showOpenGhost(card());

    expect(ghosts()).toEqual([]);
  });
});
