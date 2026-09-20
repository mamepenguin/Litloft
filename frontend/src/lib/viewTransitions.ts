"use client";

import { dirtyRegistry } from "./dirtyRegistry";
import { TRANSITION_NAMES } from "./transitionNames";

/**
 * What the navigation is, which the stylesheet reads off `<html>`. It is
 * always set while a transition runs: the names themselves are declared
 * under `html[data-vt]`, so that a `view-transition-name` — which forms a
 * backdrop root for as long as it is set, transition or not — exists only
 * for the length of one.
 */
export type TransitionKind =
  | "folder-down"
  | "folder-up"
  | "folder-flat"
  | "file-open";

export interface TransitionOptions {
  /** The card the open file grows out of. */
  hero?: HTMLElement | null;
  /** Defaults to the current url; a commit back to it does not count. */
  startUrl?: string;
}

/**
 * The page accepts no input until the update callback settles, so a
 * navigation that never commits has to stop holding it. This plus the
 * 200ms the stylesheet animates for is the whole input-blocking budget:
 * a commit slower than this loses its animation rather than the page
 * losing its input.
 */
export const COMMIT_TIMEOUT_MS = 100;

interface ViewTransitionLike {
  finished: Promise<unknown>;
  skipTransition: () => void;
}

interface Pending {
  hero: HTMLElement | null;
  startUrl: string;
  committed: boolean;
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
  delete document.documentElement.dataset.vt;
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
  kind: TransitionKind,
  navigate?: () => void,
  options: TransitionOptions = {},
): void {
  const { hero = null } = options;
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
    navigate?.();
    return;
  }

  if (pending) supersede(pending);

  const p: Pending = {
    hero,
    startUrl: options.startUrl ?? currentUrl(),
    committed: false,
    timer: undefined,
    resolve: undefined,
    skip: undefined,
    cleaned: false,
  };
  pending = p;

  if (hero) hero.style.viewTransitionName = TRANSITION_NAMES.fileHero;
  document.documentElement.dataset.vt = kind;

  let transition: ViewTransitionLike | undefined;
  try {
    transition = start.call(document, () => {
      navigate?.();
      // The commit can land before the browser runs this callback, when
      // something else is driving the navigation.
      if (p.committed) return Promise.resolve();
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
  p.committed = true;
  clearTimeout(p.timer);
  p.resolve?.();
}

/**
 * For a navigation this code does not perform — a `<Link>`, where Next
 * owns the routing. The browser captures the destination when the update
 * callback settles, so holding it open until the commit is enough; the
 * callback does not have to be what changes the DOM.
 */
export function transitionAroundNavigation(
  kind: TransitionKind,
  options: TransitionOptions = {},
): void {
  navigateWithTransition(kind, undefined, options);
}

export function _resetViewTransitionsForTests(): void {
  if (pending) cleanup(pending);
  pending = null;
}
