"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getSetupStatus } from "@/lib/adminConfig";

export function SetupRedirector(): null {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith("/setup")) return;
    let cancelled = false;
    getSetupStatus()
      .then((status) => {
        if (cancelled) return;
        if (!status.completed) {
          router.replace("/setup");
        }
      })
      .catch(() => {
        // Endpoint may be unreachable on first cold-start before backend
        // is ready; silent fail keeps the rest of the app usable.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
