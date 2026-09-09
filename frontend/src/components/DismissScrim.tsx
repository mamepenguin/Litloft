"use client";

import type { MouseEvent, ReactElement } from "react";

/**
 * The class list a menu-surface popup gives its scrim.
 *
 * Dimmed below 640px, where the popup is a bottom sheet and the page
 * behind it is not part of the interaction; transparent above it, where
 * the popup is a small panel anchored to its trigger and hiding the page
 * would say more than is happening. `z-30` is the popover tier
 * (`DESIGN.md` §Layering); a caller whose popup sits in a higher tier
 * passes its own band instead.
 */
export const MENU_SCRIM = "fixed inset-0 z-30 bg-black/30 sm:bg-transparent";

export interface DismissScrimProps {
  /** Close the popup. */
  onDismiss: () => void;
  /** The scrim's own box and tier. Defaults to {@link MENU_SCRIM}. */
  className?: string;
  /**
   * Renders the scrim as a named `<button>` rather than an inert `<div>`.
   *
   * Only for a scrim that is the popup's *stated* way out — the
   * over-frame settings panel names its backdrop, because over media
   * there is no visible page edge to say where the panel stops. A menu
   * whose scrim is transparent gains nothing from a tab stop that reads
   * as a control and does nothing but close.
   */
  label?: string;
  /**
   * Absorb a right-click / long-press too, instead of letting the browser
   * open its own menu over this one. `ContextMenu` is the popup that was
   * opened by that gesture in the first place.
   */
  dismissOnContextMenu?: boolean;
  "data-testid"?: string;
}

/**
 * Marks the rendered element as a popup's dismissal surface.
 *
 * In its default form a scrim has no role, no accessible name, no text
 * and — above 640px — no colour, so there is nothing else to address it
 * by. `__tests__/helpers/dismissScrim.ts` finds it by this attribute, and
 * insists on exactly one being mounted: two would mean two popups are
 * open, and a helper that took the first would dismiss the wrong one.
 *
 * It is not what `popup-dismissal.test.ts` scans for. That reads source
 * text for `<DismissScrim`, because the question there is which files
 * render one, not what any of them produced at runtime.
 */
export const DISMISS_SCRIM_ATTR = "data-dismiss-scrim";

/**
 * The one way a popup in this tree is dismissed by pointer.
 *
 * A full-frame surface over everything the popup does not own, which
 * closes it **on `click`** — not on `pointerdown`, `mousedown` or
 * `touchstart`.
 *
 * That choice is the whole component. A touch's `click` is dispatched
 * after `touchend`, at the point the finger left, against whatever is
 * topmost *then*. A popup that closes on the press has already unmounted
 * its scrim by that moment, so the click hit-tests to whatever was
 * underneath and runs it: the tap that dismissed a menu also opened a
 * file, toggled a mode, or navigated away. Closing on the click instead
 * means the scrim is still there to receive it, and it stops there.
 * Dismissing a popup must not also activate what is under the finger.
 *
 * The same reasoning rules out a `document`-level listener with a
 * "was the target inside the menu" test: it answers on the press, and
 * the element underneath never stopped being the click's target.
 *
 * A mouse is the case where the difference does not show, because
 * cancelling `pointerdown` suppresses the compatibility mouse events —
 * which is why a tree can carry this defect for a long time and only a
 * phone finds it.
 *
 * **Rendered in place, never portalled.** Inside the mobile Bottom Sheet
 * vaul is modal: `pointer-events: none` on `<body>` and `aria-hidden` on
 * every other body child, so a scrim portalled to the body from in there
 * — `useDialogPortalTarget()` included, which lands in the sheet's own
 * dialog host — is stacked correctly and inert. Left where it is written,
 * the scrim is a sibling of the popup and shares its containing block, so
 * whatever the popup is drawn against the scrim covers.
 *
 * Inside the sheet that containing block is `Drawer.Content`, which
 * carries a transform: the scrim covers the drawer rather than the
 * window. That is the area a finger can reach anything in — vaul's own
 * overlay owns everything outside the drawer, and dismissing to it
 * collapses the sheet.
 *
 * Escape is not here. It goes through `useShortcuts`, which knows what is
 * stacked above what; `escape-listeners.test.ts` records why a listener
 * of one's own is wrong.
 */
export function DismissScrim({
  onDismiss,
  className = MENU_SCRIM,
  label,
  dismissOnContextMenu = false,
  "data-testid": testId,
}: DismissScrimProps): ReactElement {
  const onContextMenu = dismissOnContextMenu
    ? (e: MouseEvent) => {
        e.preventDefault();
        onDismiss();
      }
    : undefined;

  if (label !== undefined) {
    return (
      <button
        type="button"
        aria-label={label}
        {...{ [DISMISS_SCRIM_ATTR]: "" }}
        data-testid={testId}
        className={className}
        onClick={() => onDismiss()}
        onContextMenu={onContextMenu}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      {...{ [DISMISS_SCRIM_ATTR]: "" }}
      data-testid={testId}
      className={className}
      onClick={() => onDismiss()}
      onContextMenu={onContextMenu}
    />
  );
}
