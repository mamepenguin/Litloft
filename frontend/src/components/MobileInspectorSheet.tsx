"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "vaul";

import type { MarkdownActionTab } from "./MarkdownActionBar";

export type SheetSectionKey = Exclude<MarkdownActionTab, "main">;

export type MobileInspectorSections = Record<SheetSectionKey, ReactNode>;

/**
 * Bottom Sheet for the mobile Markdown layout (spec §D5 / hako
 * sFXCwZDluTPZZkbYuozwJ). Hosts the three Sheet sections that mirror
 * a slice of the desktop inspector: tags / related / AI summary.
 * Comments stays on the canvas footer below the body — see
 * MarkdownActionBar JSDoc for why that fourth tab was dropped.
 *
 * Open state is derived from `activeTab`:
 *   - `"main"` → drawer closed.
 *   - any other → drawer open, that section rendered.
 *
 * Built on vaul (Drawer.Root) — chosen over hand-rolled CSS because
 * the Sheet motion / drag-to-dismiss / focus trap is a UX expectation
 * users have from native messaging apps, and vaul keeps the bundle
 * impact small (~10 KB). See hako sFXCwZDluTPZZkbYuozwJ for the
 * decision rationale and the exception to the earlier "no Drawer
 * library" judgement.
 *
 * Only the matching section's children are mounted at a time (saves
 * re-renders + prevents leftover state when the user switches tabs).
 */
export function MobileInspectorSheet({
  activeTab,
  onClose,
  sections,
}: {
  activeTab: MarkdownActionTab;
  onClose: () => void;
  sections: MobileInspectorSections;
}): ReactElement | null {
  const t = useTranslations("inspector.sections");

  const open = activeTab !== "main";
  // vaul fires onOpenChange(false) for drag-down / backdrop tap / ESC.
  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  // Keep the last non-"main" tab around so the Sheet's content
  // doesn't go blank mid-close. vaul keeps Drawer.Content mounted
  // during its slide-down animation; if we clear the children the
  // instant `activeTab` flips to "main" the user sees an empty
  // drawer slide away. Pinning the displayed tab to the most recent
  // non-main value lets the content stay legible while the close
  // animation plays.
  //
  // On transition to "main" we clear `displayedTab` after the close
  // animation completes (~300ms in vaul + a 50ms cushion) so the
  // section unmounts and any in-flight drafts (e.g. SummarySection's
  // short/long_summary edits) are discarded consistently. Without
  // this, close-via-backdrop kept drafts while tab-switch discarded
  // them — review HIGH H2 / hako 5rtHKXzQd9VJY7WNU5Deg.
  const [displayedTab, setDisplayedTab] = useState<SheetSectionKey | null>(
    activeTab !== "main" ? (activeTab as SheetSectionKey) : null,
  );
  useEffect(() => {
    if (activeTab !== "main") {
      setDisplayedTab(activeTab as SheetSectionKey);
      return;
    }
    const timer = setTimeout(() => setDisplayedTab(null), 350);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Headings reuse `inspector.sections.*` so the desktop and mobile
  // surfaces stay in sync.
  const headingFor: Record<SheetSectionKey, string> = {
    tags: t("tags"),
    related: t("related"),
    ai: t("aiSummary"),
  };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal
      // Modal: vaul locks page scroll, traps focus, and overlays the
      // Action Bar so swipes inside the drawer never propagate to
      // the underlying markdown body (user feedback from PWA test:
      // "ドロワーの上でスワイプした時にコンテンツがスクロールする
      // のを防いでほしい"). Switching tabs while open is a
      // close-then-reopen flow, which matches iOS bottom-sheet
      // expectations. Pass `modal` explicitly even though vaul's
      // default is true — the contract is durable across version
      // bumps (Phase 4 review L5, hako 5rtHKXzQd9VJY7WNU5Deg).
    >
      <Drawer.Portal>
        <Drawer.Overlay
          data-testid="mobile-inspector-overlay"
          // z-[55] to sit ABOVE the floating MenuButton (z-50) so
          // the user can't tap through the modal overlay while the
          // drawer is open. Drawer.Content goes one higher at
          // z-[60] to stay above its own overlay.
          className="fixed inset-0 z-[55] bg-black/50"
        />
        <Drawer.Content
          data-testid="mobile-inspector-sheet"
          // hako sFXCwZDluTPZZkbYuozwJ follow-up (4th PWA pass):
          // anchor at `bottom: 0` so vaul's close transform animates
          // the full slide-down distance. Min-height keeps the
          // drawer visibly open even when the inner content is
          // empty (e.g. AI tab on a file with no summary) so the
          // user can see they tapped into a real section. Max-height
          // caps it at 60vh. Drawer sits ABOVE the Action Bar
          // (z-50 vs bar's z-30) — the drawer covers the bar while
          // open, matching native iOS bottom-sheet semantics. No
          // bottom padding clearance needed since nothing has to
          // peek through.
          className="fixed bottom-0 left-0 right-0 z-[60] flex h-[50vh] max-h-[60vh] min-h-[18rem] flex-col rounded-t-2xl border-t border-bg-border bg-bg-card outline-none"
        >
          {/* Grab handle */}
          <div
            aria-hidden
            className="mx-auto mt-3 h-1 w-12 rounded-full bg-bg-border"
          />
          {/* Heading: rendered against `displayedTab` so the title
              stays present during the slide-down close animation. */}
          {displayedTab && (
            <Drawer.Title className="px-4 pt-3 pb-2 text-sm font-semibold text-text-primary">
              {headingFor[displayedTab]}
            </Drawer.Title>
          )}
          {/* Section body — same pinning trick as the title.
              The drawer now sits above the Action Bar so no
              clearance padding is needed; the safe-area inset is
              still respected so scrolled-to-bottom content clears
              the home indicator. */}
          <div
            className="flex-1 overflow-auto px-4"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            {displayedTab ? sections[displayedTab] : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
