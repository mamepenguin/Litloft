"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";

import { folderTransitionKind } from "@/lib/folderTransition";
import { transitionAroundNavigation } from "@/lib/viewTransitions";

interface FolderLinkProps {
  onNavigate: () => void;
}

/**
 * Props for a `<Link>` that moves between folders. `onNavigate` fires only
 * for a client-side navigation, so a modifier-click, a middle-click or a
 * download still behaves as an ordinary link.
 *
 * The event is not cancelled and no router is called: Next performs the
 * navigation as it always has, and the transition only has to stay open
 * until the destination commits.
 */
export function useFolderLink(): (href: string) => FolderLinkProps {
  const pathname = usePathname();

  return useCallback(
    (href: string) => ({
      onNavigate: () => {
        transitionAroundNavigation(
          pathname
            ? folderTransitionKind(pathname, href.split("?")[0])
            : "folder-flat",
        );
      },
    }),
    [pathname],
  );
}
