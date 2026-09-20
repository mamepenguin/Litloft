"use client";

import { dirtyRegistry } from "./dirtyRegistry";
import { TRANSITION_NAMES } from "./transitionNames";

export type TransitionDirection = "folder-down" | "folder-up";

export interface TransitionOptions {
  /** The card the open file grows out of. */
  hero?: HTMLElement | null;
  direction?: TransitionDirection;
  /** Defaults to the current url; a commit back to it does not count. */
  startUrl?: string;
}

/**
 * The page accepts no input until the update callback settles, so a
 * navigation that never commits has to stop holding it.
 */
export const COMMIT_TIMEOUT_MS = 250;

interface ViewTransitionLike {
  finished: Promise<unknown>;
  skipTransition: () => void;
}

interface Pending {
  hero: HTMLElement | null;
  hadDirection: boolean;
  startUrl: string;
  timer: ReturnType<typeof setTimeout> | undefined;
  resolve: (() => void) | undefined;
  skip: (() => void) | undefined;
  cleaned: boolean;
}

let pending: Pending | null = null;

/** Built the same way the commit signal builds its url, so the two compare. */
function currentUrl(): string {
  const query = new URLSearchParams(window.location.search).toString();
  const { pathname } = window.location;
  return query ? `${pathname}?${query}` : pathname;
}

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cleanup(p: Pending): void {
  if (p.cleaned) return;
  p.cleaned = true;
  clearTimeout(p.timer);
  if (p.hero) p.hero.style.viewTransitionName = "";
  if (p.hadDirection) delete document.documentElement.dataset.vt;
  if (pending === p) pending = null;
}

/** Let go of a transition that a newer one has replaced. */
function supersede(p: Pending): void {
  clearTimeout(p.timer);
  p.resolve?.();
  p.skip?.();
  cleanup(p);
}

/**
 * Runs `navigate` inside a view transition, or plainly when one must not
 * run. Every name this writes is written here and cleared here: a caller
 * that sets one itself has no way to clear it on the paths where no
 * transition ever starts.
 */
export function navigateWithTransition(
  navigate: () => void,
  options: TransitionOptions = {},
): void {
  const { hero = null, direction } = options;
  const start = (
    document as Document & {
      startViewTransition?: (cb: () => unknown) => ViewTransitionLike;
    }
  ).startViewTransition;

  // A dirty tab sends the navigation through `navigationGuard`, which may
  // queue it behind a dialog the user then cancels. There would be no
  // navigation to transition and nothing to clear the names.
  if (
    typeof start !== "function" ||
    prefersReducedMotion() ||
    dirtyRegistry.isDirty()
  ) {
    navigate();
    return;
  }

  if (pending) supersede(pending);

  const p: Pending = {
    hero,
    hadDirection: direction !== undefined,
    startUrl: options.startUrl ?? currentUrl(),
    timer: undefined,
    resolve: undefined,
    skip: undefined,
    cleaned: false,
  };
  pending = p;

  if (hero) hero.style.viewTransitionName = TRANSITION_NAMES.fileHero;
  if (direction) document.documentElement.dataset.vt = direction;

  let transition: ViewTransitionLike | undefined;
  try {
    transition = start.call(document, () => {
      navigate();
      return new Promise<void>((resolve) => {
        p.resolve = resolve;
        p.timer = setTimeout(() => {
          resolve();
          transition?.skipTransition();
        }, COMMIT_TIMEOUT_MS);
      });
    });
  } catch (error) {
    cleanup(p);
    throw error;
  }

  p.skip = () => transition?.skipTransition();
  Promise.allSettled([transition.finished]).then(() => cleanup(p));
}

/**
 * Called once per committed render that carries a new url. This is the
 * signal the update callback waits for — the router's own promise resolves
 * before React has put the destination in the DOM.
 */
export function notifyNavigationCommit(url: string): void {
  const p = pending;
  if (!p || p.cleaned || url === p.startUrl) return;
  clearTimeout(p.timer);
  p.resolve?.();
}

export function _resetViewTransitionsForTests(): void {
  if (pending) cleanup(pending);
  pending = null;
}
