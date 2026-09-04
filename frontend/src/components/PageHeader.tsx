"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The one page header.
 *
 * Fourteen styles were in the tree before Phase 3 (UI redesign A-1): four h1
 * sizes, three tab styles, and screens that split one header across three
 * rows or omitted it entirely. Part of the cause was in the spec rather than
 * the code — DESIGN.md §3.2 gave H1 no Size at all, so four call sites each
 * picked one. The size now lives there and the arrangement lives here.
 *
 * This component renders. It holds no state and calls nothing: the
 * Container/Presenter split in `.claude/rules/frontend-conventions.md` applies
 * to new components whose state *and* UI are both non-trivial, and half of
 * that is missing here.
 */
export interface PageHeaderProps {
  /**
   * Pass `<Breadcrumb …>` built by the caller. It is a node rather than a set
   * of props because the folder view hands it drag-and-drop handlers that
   * nothing else needs, and this component has no business knowing about them.
   */
  breadcrumb?: ReactNode;
  /**
   * A small navigation control at the very start of the header — today only
   * `<TreeToggle>`. It sits on the first row that renders, so the tree button
   * stays leftmost whether or not the screen has a title.
   */
  leading?: ReactNode;
  /** An icon before the title. Trash, Missing, Ask and Find each have one. */
  titleIcon?: LucideIcon;
  /**
   * The page's subject. **Omit it when the breadcrumb is the subject** —
   * folders and the inside of an archive name themselves in the trail, and a
   * second heading repeating the last segment is one subject stated twice.
   * An `<h1>` is emitted only when this is given.
   */
  title?: ReactNode;
  /**
   * One line under the subject: counts, duration, state, drive name — "what
   * am I looking at, and how much of it". Prose is fine (the Missing view
   * explains itself here).
   */
  scope?: ReactNode;
  /** Trailing controls: a danger button, a save button, an `AddonSlot`. */
  actions?: ReactNode;
  /** A `<PageTabs>`. Screens without one render no tab row. */
  tabs?: ReactNode;
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
  const hasTitle = title !== undefined;

  // Without a title the scope and the actions have nothing to sit under, so
  // they join the trail — "Documents / 2024  ·  138 items" reads as one
  // subject with its measure, where a second row would read as two.
  const scopeOnTrail = !hasTitle && scope !== undefined;
  const actionsOnTrail = !hasTitle && actions !== undefined;

  // The trail row also carries anything a missing title would have stranded.
  // Rendering it only for `leading || breadcrumb` would drop a titleless
  // screen's actions on the floor, and nothing at runtime would say so.
  //
  // `leading` is deliberately *not* a reason to open this row. Search mode has
  // a tree toggle and a title but no breadcrumb, and counting `leading` here
  // gave it a row holding nothing but that button, floating above its own
  // heading. `leading` joins the first row that exists instead.
  const hasTrailRow =
    breadcrumb !== undefined ||
    scopeOnTrail ||
    actionsOnTrail ||
    (leading !== undefined && !hasTitle);

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
        <div className="flex min-w-0 items-start gap-2">
          {/* The tree toggle stays leftmost. With no trail above, this row is
              the first one. */}
          {!hasTrailRow && leading}
          {/* The icon is a sibling of the heading, not a child of it, so it
              cannot reach the `<h1>`'s accessible name — and a test written
              against that name says nothing about whether the icon is
              announced. `aria-hidden` is what actually governs that here, so
              it is written explicitly and asserted directly, even though
              lucide-react would supply the same attribute on its own. Pinning
              a dependency's default is a legitimate thing to do when the
              design rests on it; pretending to test our own code is not. */}
          {TitleIcon && (
            <TitleIcon
              size={20}
              aria-hidden="true"
              className="mt-1 flex-shrink-0 text-text-muted"
            />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-text-primary">
              {title}
            </h1>
            {scope !== undefined && (
              <div className="mt-1 text-sm text-text-muted">{scope}</div>
            )}
          </div>
          {actions !== undefined && (
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
