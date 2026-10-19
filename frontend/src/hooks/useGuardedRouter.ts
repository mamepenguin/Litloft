"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { navigationGuard } from "@/lib/navigationGuard";

type NavigateOptions = Parameters<
  ReturnType<typeof useRouter>["push"]
>[1];

/**
 * ``back`` / ``forward`` / ``refresh`` / ``prefetch`` pass through
 * untouched: the popstate listener inside ``<DirtyBlocker />``
 * handles the back-button case at a different layer (we can't see
 * the destination url here, so guarding ``back()`` programatically
 * would mean refusing to go anywhere).
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
