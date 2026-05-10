"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";

/**
 * Global dirty-navigation gatekeeper. Mounted once near the root of
 * the app (``app/layout.tsx``) and acts as the single visible UI of
 * ``navigationGuard``:
 *
 *   - Renders the discard-changes ``ConfirmDialog`` whenever a
 *     navigation has been queued by ``navigationGuard.request``.
 *   - Listens for ``popstate`` and pushes the URL forward to undo
 *     the back navigation, then queues a ``history.back()`` so the
 *     user's confirm restarts the back. Browser ``back`` is
 *     reactive (URL has already changed by the time popstate
 *     fires); the push-undo trick is the standard workaround used
 *     by react-router and friends.
 *   - Listens for ``beforeunload`` and lets the browser show its
 *     native confirmation when something is dirty. We can't
 *     surface our own dialog there: modern browsers ignore custom
 *     ``returnValue`` strings.
 *
 * Phase 2 PR-5 of the right-pane equivalence spec
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md
 * §5 Phase 2.2). Centralizes the dialog that PR-4 used to render
 * inside ``RightPaneFile`` / ``FileDetailFullScreen``.
 */
export function DirtyBlocker() {
  const tCommon = useTranslations("common");
  const pending = useSyncExternalStore(
    navigationGuard.subscribe,
    navigationGuard.getPending,
    () => null,
  );

  useEffect(() => {
    const onPopState = () => {
      if (!dirtyRegistry.isDirty()) return;
      const currentHref =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      // Undo the back navigation so the URL still matches the dirty
      // editor's file. confirm() will re-fire history.back().
      window.history.pushState(null, "", currentHref);
      navigationGuard.request(() => window.history.back());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRegistry.isDirty()) return;
      e.preventDefault();
      // Legacy compat — Chrome <=119 still required this assignment.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <ConfirmDialog
      open={pending !== null}
      title={tCommon("discardUnsaved.title")}
      message={tCommon("discardUnsaved.message")}
      confirmLabel={tCommon("discardUnsaved.confirmLabel")}
      onConfirm={() => navigationGuard.confirm()}
      onCancel={() => navigationGuard.cancel()}
    />
  );
}
