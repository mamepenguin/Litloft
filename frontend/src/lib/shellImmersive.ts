"use client";

import { useEffect } from "react";

import { isNativeShell, postToShell, shellAnswersImmersive, subscribeToShell } from "./nativeBridge";

export const IMMERSIVE_ANSWER_TIMEOUT_MS = 1000;
const VIEWPORT_POLL_MS = 16;

let holders = 0;
let widened: Promise<void> = Promise.resolve();

export interface ImmersiveHold {
  /** Resolves once the page's viewport has the size the shell widened it to. */
  ready: Promise<void>;
  release(): void;
}

function viewportIs(width: number, height: number): boolean {
  const root = document.documentElement;
  return root.clientWidth === width && root.clientHeight === height;
}

/**
 * The shell's answer arrives once its own layout is done; WebKit resizes the
 * page's viewport after that, so the wait runs until the two agree.
 */
function waitForWidening(): Promise<void> {
  return new Promise((resolve) => {
    let target: { width: number; height: number } | null = null;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(deadline);
      clearTimeout(poll);
      unsubscribe();
      resolve();
    };
    const check = () => {
      if (target && viewportIs(target.width, target.height)) {
        finish();
        return;
      }
      poll = setTimeout(check, VIEWPORT_POLL_MS);
    };
    const deadline = setTimeout(finish, IMMERSIVE_ANSWER_TIMEOUT_MS);
    const unsubscribe = subscribeToShell((message) => {
      if (message.type !== "page.immersive.applied" || !message.active) return;
      target = { width: message.width, height: message.height };
      clearTimeout(poll);
      check();
    });
  });
}

/** In a browser this does nothing and is ready at once. */
export function holdImmersive(): ImmersiveHold {
  if (!isNativeShell()) return { ready: Promise.resolve(), release: () => {} };

  holders += 1;
  if (holders === 1) {
    const ready = shellAnswersImmersive() ? waitForWidening() : Promise.resolve();
    postToShell({ type: "page.immersive", active: true });
    widened = ready;
  }

  let released = false;
  return {
    ready: widened,
    release() {
      if (released) return;
      released = true;
      holders -= 1;
      if (holders === 0) postToShell({ type: "page.immersive", active: false });
    },
  };
}

export function useShellImmersive(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return holdImmersive().release;
  }, [active]);
}
