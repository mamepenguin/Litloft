"use client";

/**
 * The gesture that answers a press on a listing card: a copy of the picture
 * swells a little and fades, over the file it is opening.
 *
 * It says "this one", not "this became that" — which is all the listing and
 * the file detail have in common here. The picture in the detail is the
 * original at its own shape, arriving whenever it decodes; the card is a
 * crop of a thumbnail whose shape depends on whether the listing was a grid
 * or a list. A copy of the card owes nothing to either.
 */

const GROWTH = 1.2;
export const GHOST_MS = 160;

let showing: HTMLElement | null = null;

function clear(): void {
  showing?.remove();
  showing = null;
}

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `origin` is the element holding the picture that was pressed. Nothing
 * here waits on the navigation: the copy is a still, and the screen behind
 * it changes whenever it changes.
 */
export function showOpenGhost(origin: HTMLElement | null): void {
  clear();
  if (!origin || prefersReducedMotion()) return;

  const box = origin.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;

  const ghost = origin.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  for (const node of ghost.querySelectorAll("[id]")) node.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("data-open-ghost", "");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "2147483000",
  });

  document.body.appendChild(ghost);
  showing = ghost;

  if (typeof ghost.animate !== "function") {
    clear();
    return;
  }

  ghost
    .animate(
      [
        { transform: "scale(1)", opacity: 0.85 },
        { transform: `scale(${GROWTH})`, opacity: 0 },
      ],
      { duration: GHOST_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "both" },
    )
    .finished.then(
      () => {
        if (showing === ghost) clear();
        else ghost.remove();
      },
      () => {
        if (showing === ghost) clear();
        else ghost.remove();
      },
    );
}

export function _resetOpenGhostForTests(): void {
  clear();
}
