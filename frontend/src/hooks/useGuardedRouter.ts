"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { navigationGuard } from "@/lib/navigationGuard";

type NavigateOptions = Parameters<
  ReturnType<typeof useRouter>["push"]
>[1];

/**
 * Drop-in replacement for ``next/navigation``'s ``useRouter`` whose
 * ``push`` and ``replace`` methods route through ``navigationGuard``
 * so any dirty editor in the tab gets a chance to ask "discard?".
 *
 * ``back`` / ``forward`` / ``refresh`` / ``prefetch`` pass through
 * untouched: the popstate listener inside ``<DirtyBlocker />``
 * handles the back-button case at a different layer (we can't see
 * the destination url here, so guarding ``back()`` programatically
 * would mean refusing to go anywhere).
 *
 * Phase 2 PR-5 of the right-pane equivalence spec
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md
 * §5 Phase 2.2).
 */
export function useGuardedRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      push: (href: string, options?: NavigateOptions) => {
        navigationGuard.request(() => router.push(href, options));
      },
      replace: (href: string, options?: NavigateOptions) => {
        navigationGuard.request(() => router.replace(href, options));
      },
      back: router.back,
      forward: router.forward,
      refresh: router.refresh,
      prefetch: router.prefetch,
    }),
    [router],
  );
}
