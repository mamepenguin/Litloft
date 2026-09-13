"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface PageTabItem {
  key: string;
  label: string;
  /** Given, the tab is a `<Link>`; omitted, a `<button>`. */
  href?: string;
  icon?: LucideIcon;
  /**
   * The `id` of the `role="tabpanel"` this tab swaps in. Ignored on a row
   * that navigates, which replaces the page and has no panel to point at.
   */
  controls?: string;
  /**
   * The `id` put on the rendered tab, so its panel can point back with
   * `aria-labelledby`.
   */
  id?: string;
}

export interface PageTabsProps {
  items: readonly PageTabItem[];
  current: string;
  onSelect?: (key: string) => void;
  label: string;
}

const BASE_CLASS =
  "-mb-px inline-flex items-center gap-1.5 rounded-t-xl border-b-2 px-4 py-2 text-sm transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "pointer-coarse:min-h-11";

const SELECTED_CLASS = "border-accent font-semibold text-text-primary";
const UNSELECTED_CLASS = "border-transparent text-text-muted hover:text-text-primary";

/**
 * A row that navigates is not a tablist: `role="tab"` promises a screen
 * reader that activating it swaps a panel in the same view, and a `<Link>`
 * replaces the page instead. Mixed input is treated as navigating — the
 * weaker promise is the safe one.
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
          an a11y prop is passed. */}
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
            id={isNav ? undefined : item.id}
            role={isNav ? undefined : "tab"}
            aria-selected={isNav ? undefined : active}
            aria-controls={isNav ? undefined : item.controls}
            // No `aria-current="page"` here. It names the current *page* in a
            // set of navigations, and this branch does not navigate.
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
