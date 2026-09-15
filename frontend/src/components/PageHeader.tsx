"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface PageHeaderProps {
  /**
   * A node rather than a set of props because the folder view hands it
   * drag-and-drop handlers that nothing else needs.
   */
  breadcrumb?: ReactNode;
  leading?: ReactNode;
  titleIcon?: LucideIcon;
  /**
   * **Omit it when the breadcrumb is the subject** — a second heading
   * repeating the last segment is one subject stated twice.
   */
  title?: ReactNode;
  scope?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}

function given(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}

export function PageHeader({
  breadcrumb,
  leading,
  titleIcon: TitleIcon,
  title,
  scope,
  actions,
  tabs,
}: PageHeaderProps) {
  const hasTitle = given(title);

  const scopeOnTrail = !hasTitle && given(scope);
  const actionsOnTrail = !hasTitle && given(actions);

  // `leading` is deliberately *not* a reason to open this row. Search mode has
  // a tree toggle and a title but no breadcrumb, and counting `leading` here
  // gives it a row holding nothing but that button.
  const hasTrailRow =
    given(breadcrumb) ||
    scopeOnTrail ||
    actionsOnTrail ||
    (given(leading) && !hasTitle);

  return (
    <header className="flex flex-col gap-1 px-4 py-2">
      {hasTrailRow && (
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          {breadcrumb}
          {scopeOnTrail && (
            <span className="flex-shrink-0 whitespace-nowrap text-sm text-text-muted">
              {scope}
            </span>
          )}
          {actionsOnTrail && (
            <div className="ml-auto flex flex-shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      {hasTitle && (
        <div className="flex min-w-0 items-start gap-3">
          {!hasTrailRow && leading}
          {/* `aria-hidden` is written explicitly even though lucide-react
              would supply the same attribute on its own. */}
          {TitleIcon && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-text-primary">
              <TitleIcon size={20} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-text-primary">
              {title}
            </h1>
            {given(scope) && (
              <div className="mt-1 text-sm text-text-muted">{scope}</div>
            )}
          </div>
          {given(actions) && (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      {tabs}
    </header>
  );
}

export default PageHeader;
