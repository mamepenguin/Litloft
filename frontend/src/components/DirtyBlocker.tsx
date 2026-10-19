"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";

/**
 * Browser ``back`` is reactive (URL has already changed by the time
 * popstate fires), so the popstate listener pushes the URL forward to
 * undo the back navigation, then queues a ``history.back()`` so the
 * user's confirm restarts the back.
 *
 * ``beforeunload`` can only trigger the browser's native confirmation:
 * modern browsers ignore custom ``returnValue`` strings.
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
