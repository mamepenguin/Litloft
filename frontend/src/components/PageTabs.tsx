"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * The one tab style. Three were in the tree before Phase 3 — underline
 * (Media Import), pill (intelligence `ModeTabs`), and a segmented control
 * (`/admin/settings`) — and the pill's selected tab was `bg-accent text-white`,
 * which spent the page's one accent fill (DESIGN.md §2.2) on saying which tab
 * you are already looking at. The underline spends a 2px border instead.
 */
export interface PageTabItem {
  key: string;
  label: string;
  /**
   * Given, the tab is a `<Link>`; omitted, a `<button>`. intelligence's Ask
   * and Find are separate routes, Media Import's two views are one page.
   */
  href?: string;
  icon?: LucideIcon;
}

export interface PageTabsProps {
  items: readonly PageTabItem[];
  current: string;
  onSelect?: (key: string) => void;
  /** Accessible name for the tab row. Pass a translated string. */
  label: string;
}

const BASE_CLASS =
  "-mb-px inline-flex items-center gap-1.5 rounded-t-xl border-b-2 px-4 py-2 text-sm transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "pointer-coarse:min-h-11";

const SELECTED_CLASS = "border-accent font-semibold text-text-primary";
const UNSELECTED_CLASS = "border-transparent text-text-muted hover:text-text-primary";

/**
 * Whether these tabs navigate.
 *
 * A row that navigates is not a tablist: `role="tab"` promises a screen
 * reader that activating it swaps a panel in the same view, and a `<Link>`
 * replaces the page instead. `ModeTabs` carried both, which is the pairing
 * this predicate exists to keep apart. Mixed input is treated as navigating —
 * the weaker promise is the safe one, and a mixed row is a bug the caller
 * should see rather than a shape to support.
 */
function navigates(items: readonly PageTabItem[]): boolean {
  return items.some((item) => item.href !== undefined);
}

export function PageTabs({ items, current, onSelect, label }: PageTabsProps) {
  const isNav = navigates(items);

  return (
    <nav
      aria-label={label}
      role={isNav ? undefined : "tablist"}
      className="flex gap-1 overflow-x-auto border-b border-bg-border"
    >
      {/* The icons carry no `aria-hidden`: lucide-react adds it itself unless
          an a11y prop is passed, so writing it here would be a duplicate that
          a test could only confirm by asserting the dependency's default.
          What is asserted instead is the tab's accessible name. */}
      {items.map((item) => {
        const active = item.key === current;
        const className = `${BASE_CLASS} ${active ? SELECTED_CLASS : UNSELECTED_CLASS}`;
        const Icon = item.icon;
        const content = (
          <>
            {Icon && <Icon size={14} />}
            {item.label}
          </>
        );

        if (item.href !== undefined) {
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={className}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            role={isNav ? undefined : "tab"}
            aria-selected={isNav ? undefined : active}
            // No `aria-current="page"` here. It names the current *page* in a
            // set of navigations, and this branch does not navigate — the
            // state a tab is in is `aria-selected`, and carrying both says the
            // same thing twice in two vocabularies. That pairing is the one
            // this component exists to take apart, so repeating it on the
            // button side would undo the point.
            onClick={() => onSelect?.(item.key)}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

export default PageTabs;
