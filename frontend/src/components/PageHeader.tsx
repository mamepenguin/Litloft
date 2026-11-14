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
  /**
   * A field that takes the title's place in the subject row. With it, `title`
   * is the page's heading but is drawn visually hidden.
   */
  titleField?: ReactNode;
  scope?: ReactNode;
  actions?: ReactNode;
  /**
   * A control that ends the scope line below `sm`, and joins the title row at
   * `sm` and wider. With it, `actions` become a row of their own after the
   * tabs below `sm`.
   */
  scopeEnd?: ReactNode;
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
  titleField,
  scope,
  actions,
  scopeEnd,
  tabs,
}: PageHeaderProps) {
  const hasTitle = given(title);
  const hasTitleField = given(titleField);

  const scopeOnTrail = !hasTitle && given(scope);
  const actionsOnTrail = !hasTitle && given(actions);

  // `leading` opens this row only where there is no title. Search mode has a
  // tree toggle and a title but no breadcrumb, and counting `leading` there
  // would give it a row holding nothing but that button.
  const hasTrailRow =
    given(breadcrumb) ||
    scopeOnTrail ||
    actionsOnTrail ||
    (given(leading) && !hasTitle);

  const withScopeEnd = hasTitle && !hasTitleField && given(scopeEnd);

  const rows = {
    title: "row-start-1",
    scope: "row-start-2",
    tabs: "row-start-3",
    actions: "row-start-4 sm:row-start-1",
  };

  const heading = hasTitle ? (
    <h1
      className={
        withScopeEnd
          ? `col-start-2 col-span-2 ${rows.title} min-w-0 truncate text-2xl font-bold text-text-primary sm:col-span-1`
          : `text-2xl font-bold text-text-primary ${
              hasTitleField ? "sr-only" : "truncate"
            }`
      }
    >
      {title}
    </h1>
  ) : null;

  return (
    <header className="flex flex-col gap-1 px-4 py-2">
      {hasTrailRow && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
          {leading}
          {breadcrumb}
          {scopeOnTrail && (
            <span className="flex-shrink-0 whitespace-nowrap text-sm text-text-muted">
              {scope}
            </span>
          )}
          {actionsOnTrail && (
            <div className="ml-auto flex max-w-full flex-shrink-0 flex-wrap items-center gap-2 sm:max-w-none sm:flex-nowrap">
              {actions}
            </div>
          )}
        </div>
      )}

      {withScopeEnd && (
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(120px,1fr)_auto_fit-content(40%)]">
          <div className={`col-start-1 ${rows.title} row-span-2 flex items-start gap-2`}>
            {!hasTrailRow && leading}
            {TitleIcon && (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-text-primary">
                <TitleIcon size={20} aria-hidden="true" />
              </div>
            )}
          </div>
          {heading}
          <div
            className={`col-start-2 col-span-2 ${rows.scope} flex min-w-0 items-center justify-between gap-2 sm:contents`}
          >
            {given(scope) && (
              <div
                className={`min-w-0 flex-initial text-sm text-text-muted max-sm:min-w-min max-sm:grow max-sm:basis-0 sm:col-start-2 ${rows.scope}`}
              >
                {scope}
              </div>
            )}
            {given(scopeEnd) && (
              // Below `sm` the scope grows from nothing and stops at its
              // min-content, so the Target keeps its whole width and only it
              // shrinks once the scope is down to that floor. From `sm` the
              // grid's `fit-content(40%)` caps the column, and the title
              // column's 120px is the narrowest a title stays readable. Below
              // `sm` the quiet control's padding hangs into the gutter, so its
              // chevron rather than its box meets the content edge.
              <div className={`min-w-0 max-sm:-mr-2 sm:col-start-4 ${rows.title}`}>
                {scopeEnd}
              </div>
            )}
          </div>
          {given(tabs) && (
            <div className={`col-span-3 ${rows.tabs} min-w-0 sm:col-span-4`}>{tabs}</div>
          )}
          {given(actions) && (
            <div
              className={`col-span-3 ${rows.actions} flex min-w-0 justify-end gap-2 max-sm:-mr-2 sm:col-span-1 sm:col-start-3`}
            >
              {actions}
            </div>
          )}
        </div>
      )}

      {hasTitleField && (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          {!hasTrailRow && leading}
          {/* `aria-hidden` is written explicitly even though lucide-react
              would supply the same attribute on its own. */}
          {TitleIcon && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-text-primary">
              <TitleIcon size={20} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 sm:flex-1">
            {heading}
            {titleField}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:contents">
            {given(scope) && (
              <div className="text-sm text-text-muted">{scope}</div>
            )}
            {given(actions) && (
              <div className="flex max-w-full flex-shrink-0 flex-wrap items-center gap-2 sm:max-w-none">
                {actions}
              </div>
            )}
          </div>
        </div>
      )}

      {hasTitle && !hasTitleField && !withScopeEnd && (
        <div className="flex min-w-0 flex-wrap items-start gap-3 sm:flex-nowrap">
          {!hasTrailRow && leading}
          {TitleIcon && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-text-primary">
              <TitleIcon size={20} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {heading}
            {given(scope) && (
              <div className="mt-1 text-sm text-text-muted">{scope}</div>
            )}
          </div>
          {given(actions) && (
            <div className="flex max-w-full flex-shrink-0 flex-wrap items-center gap-2 sm:max-w-none">
              {actions}
            </div>
          )}
        </div>
      )}

      {!withScopeEnd && tabs}
    </header>
  );
}

export default PageHeader;
