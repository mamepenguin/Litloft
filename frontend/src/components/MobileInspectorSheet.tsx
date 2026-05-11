"use client";

import { type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "vaul";

/**
 * Bottom Sheet that mirrors the desktop Inspector on mobile widths.
 *
 * 2026-05-11 chrome consolidation: the previous three-tab Action Bar
 * (tags / related / AI) was retired. The Inspector toggle in the
 * unified chrome now flips a single open/closed bit; opening this
 * sheet shows the *same* inspector content the desktop pane renders,
 * scrolled inline. Keeping the surfaces identical removes the divergent
 * code path between phone and laptop, which is mostly what made the
 * previous tabbed sheet expensive to maintain (tab-specific section
 * lists, displayedTab pinning to survive the close animation, etc.).
 *
 * Open state is controlled by the host (the layout decides whether
 * the user tapped the chrome's Inspector toggle). vaul calls
 * `onClose` when the user swipes the sheet down / taps the backdrop
 * / hits ESC.
 *
 * Built on vaul (Drawer.Root) — chosen over hand-rolled CSS because
 * the Sheet motion / drag-to-dismiss / focus trap is a UX expectation
 * users have from native messaging apps, and vaul keeps the bundle
 * impact small (~10 KB). See hako sFXCwZDluTPZZkbYuozwJ for the
 * original decision rationale.
 */
export function MobileInspectorSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}): ReactElement | null {
  const t = useTranslations("inspector");

  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange} modal>
      <Drawer.Portal>
        <Drawer.Overlay
          data-testid="mobile-inspector-overlay"
          className="fixed inset-0 z-[55] bg-black/50"
        />
        <Drawer.Content
          data-testid="mobile-inspector-sheet"
          className="fixed bottom-0 left-0 right-0 z-[60] flex h-[90vh] max-h-[90vh] min-h-[18rem] flex-col rounded-t-2xl border-t border-bg-border bg-bg-card outline-none"
        >
          <div
            aria-hidden
            className="mx-auto mt-3 h-1 w-12 rounded-full bg-bg-border"
          />
          <Drawer.Title className="px-4 pt-3 pb-2 text-sm font-semibold text-text-primary">
            {t("title")}
          </Drawer.Title>
          {/* Visually hidden description for assistive tech — vaul
              (Radix Dialog) requires either a Description or an
              explicit `aria-describedby={undefined}` to silence the
              accessibility warning. We supply a human description so
              screen-reader users get a brief preamble before the
              section stack is announced. */}
          <Drawer.Description className="sr-only">
            {t("sheetDescription")}
          </Drawer.Description>
          <div
            className="flex-1 overflow-auto"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
