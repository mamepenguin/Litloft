"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import {
  Hash,
  Link as LinkIcon,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * Tab keys for the mobile Markdown action bar.
 *
 * Three buttons render (tags / related / ai). "main" is not a button
 * — it represents the closed-Sheet state ("I'm reading / editing the
 * body"). The host flips activeTab back to "main" to collapse the
 * Sheet; re-tapping the currently active tab is the user-facing
 * close affordance.
 *
 * Originally the spec proposed a fourth "comments" tab, but the
 * canvas footer already shows the `CommentSection` directly below
 * the body, so a dedicated comments Sheet tab was dropped after
 * PWA testing.
 *
 * Spec: 2026-05-10-markdown-document-layout.md §D5.
 * hako: sFXCwZDluTPZZkbYuozwJ.
 */
export type MarkdownActionTab = "main" | "tags" | "related" | "ai";

interface TabDescriptor {
  key: Exclude<MarkdownActionTab, "main">;
  icon: LucideIcon;
}

// Visible tabs only: tags / related / ai. The "main" key still
// exists in the type system as the implicit "Sheet closed" state,
// but it gets no button — the user closes via tapping the active
// tab, swiping the Sheet down, or tapping the backdrop.
const TABS: TabDescriptor[] = [
  { key: "tags", icon: Hash },
  { key: "related", icon: LinkIcon },
  { key: "ai", icon: Sparkles },
];

/**
 * Floating pill action bar shown on mobile widths. Three buttons
 * (tags / related / ai) open the Bottom Sheet at the matching
 * section; re-tapping the active button collapses the Sheet via the
 * host flipping `activeTab` back to "main".
 *
 * The host (MarkdownDocumentLayout) owns the active-tab state; this
 * component is purely controlled.
 *
 * The `hidden` prop is set by the host when the user has focus inside
 * the editor textarea — keeping the bar visible above an open soft
 * keyboard on iOS Safari is fiddly (Visual Viewport API + per-OS
 * quirks). Spec D5 / hako sFXCwZDluTPZZkbYuozwJ: hide on focus, restore
 * on blur. Edit-mode users want the textarea uncluttered anyway.
 */
export function MarkdownActionBar({
  activeTab,
  onTabSelect,
  hidden = false,
}: {
  activeTab: MarkdownActionTab;
  onTabSelect: (tab: MarkdownActionTab) => void;
  hidden?: boolean;
}): ReactElement {
  const t = useTranslations("inspector.actionBar");

  // Floating-pill placement (hako sFXCwZDluTPZZkbYuozwJ +
  // S8q937LQ9lrM0foa3_Oen follow-up + 4th PWA pass): a single
  // rounded pill, glassy (backdrop-blur + translucent fill), tucked
  // just above the home indicator with only the safe-area inset and
  // a 4px breathing strip. `z-30` puts the bar below the Drawer
  // (which is z-50 + z-40 overlay) so when the Sheet opens it
  // covers the bar — matching native iOS bottom-sheet semantics
  // and preventing accidental edge-swipe / page-scroll bleed.
  return (
    <nav
      data-testid="markdown-action-bar"
      aria-label={t("tabsAria")}
      className={`fixed left-3 right-3 z-30 flex items-stretch justify-around overflow-hidden rounded-full border border-bg-border bg-bg-card/85 shadow-[0_2px_8px_rgba(0,0,0,0.18)] backdrop-blur-lg ${
        hidden ? "hidden" : ""
      }`}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)" }}
    >
      {TABS.map(({ key, icon: Icon }) => {
        const isActive = key === activeTab;
        const label = t(key);
        return (
          <button
            key={key}
            type="button"
            data-testid={`action-tab-${key}`}
            aria-pressed={isActive}
            aria-label={label}
            onClick={() => onTabSelect(key)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] leading-none transition-colors ${
              isActive
                ? "text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Icon size={17} strokeWidth={isActive ? 2.25 : 1.75} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
