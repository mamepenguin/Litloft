"use client";

import { useEffect, useRef, type ReactElement } from "react";

/**
 * The class list a menu-surface popup gives its scrim.
 *
 * Dimmed below 640px, where the popup is a bottom sheet and the page
 * behind it is not part of the interaction; transparent above it, where
 * the popup is a small panel anchored to its trigger and hiding the page
 * would say more than is happening.
 *
 * `z-30` is the popover tier (`DESIGN.md` §Layering) and it is a
 * statement about **what the dim covers**, nothing more. Dismissal does
 * not go through this box — see the component below — so a scrim that
 * loses the paint order to a sticky bar draws its tint under that bar and
 * behaves identically. Three rounds of this unit tried to make a number
 * carry the behaviour and each lost to an arrangement the rule had not
 * foreseen.
 */
export const MENU_SCRIM = "fixed inset-0 z-30 bg-black/30 sm:bg-transparent";

export interface DismissScrimProps {
  /** Close the popup. */
  onDismiss: () => void;
  /**
   * **The popup this guards.** Rendered immediately after the scrim, as
   * its sibling — the same DOM the callers wrote by hand before, and now
   * the component's own output, because the mechanism needs to know
   * exactly which subtree is "inside".
   *
   * A press inside it is the user working the popup and is left alone. A
   * press anywhere else dismisses. Passing the popup rather than looking
   * for it is the point: there is no arrangement in which the two can
   * drift apart, and no shape a scan has to recognise.
   */
  children: ReactElement;
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
   *
   * A named backdrop is a control, so it keeps its pointer events and its
   * `onClick` — which is what a keyboard activation on it goes through,
   * there being no press to answer.
   */
  label?: string;
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
 * Take the click this press is about to produce, once, and let nothing
 * else see it.
 *
 * `capture` on `document` is the first listener in the path, so
 * `stopPropagation` there keeps the click from every element handler and
 * from React's own root listener, and `preventDefault` keeps a link from
 * navigating and a label from toggling its control. Both are needed:
 * stopping propagation alone leaves the default action.
 *
 * **One click, and only the one this press produces.** Two things keep
 * that true. A press that cannot produce a click — anything but the
 * primary button — arms nothing at all. And a press that could have but
 * did not is abandoned by whatever says so: a `pointercancel` (the touch
 * became a scroll), a keystroke, or a second press. Without either, a
 * swallow sits armed and eats some later, unrelated click; the first is
 * what a right-press needs, because `useContextMenu` raises its menu from
 * `contextmenu` while that press is still in flight.
 *
 * The arming press is compared by identity rather than counted, so
 * arming from inside that press's own dispatch cannot abandon itself.
 * (The DOM copies a node's listener list before invoking it, so a
 * listener added during dispatch does not run for that event — this does
 * not rely on that.)
 */
let disarm: (() => void) | null = null;

/** The only button whose press produces a `click`. */
const PRIMARY_BUTTON = 0;

function swallowTheClickThisPressProduces(press: Event): void {
  // A press that produces no click has nothing to swallow, and arming for
  // one leaves the swallow sitting until something abandons it — a state
  // the sentence above says does not exist. A right-press raises
  // `contextmenu` and a middle one `auxclick`; neither raises `click`, and
  // `useContextMenu` opens its menu from `contextmenu`, so the mount-time
  // arming meets a right-press every time a context menu is raised by
  // mouse.
  if ("button" in press && (press as PointerEvent).button !== PRIMARY_BUTTON) {
    return;
  }

  disarm?.();

  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    disarm?.();
  };
  const abandon = (e: Event) => {
    if (e === press) return;
    disarm?.();
  };

  disarm = () => {
    document.removeEventListener("click", swallow, true);
    document.removeEventListener("pointerdown", abandon, true);
    document.removeEventListener("pointercancel", abandon, true);
    document.removeEventListener("keydown", abandon, true);
    disarm = null;
  };

  document.addEventListener("click", swallow, true);
  document.addEventListener("pointerdown", abandon, true);
  document.addEventListener("pointercancel", abandon, true);
  document.addEventListener("keydown", abandon, true);
}

/**
 * The press happening right now, if one is.
 *
 * **A popup can be raised *by* a press this component never saw.**
 * `useContextMenu` opens `ContextMenu` from a 500 ms timer on
 * `touchstart`, so by the time a scrim exists the press that raised it is
 * already half over: the primitive's own listener answered nothing, no
 * swallow was armed, and the `click` the lift produces went to the row
 * under the finger. Long-pressing a file card opened its menu **and**
 * navigated to the file. The old scrim covered this by accident, being
 * `pointer-events: auto` and in the way; appearance cannot.
 *
 * So the class is closed rather than the call site: whatever raised it, a
 * popup that mounts *during* a press arms the swallow for that press. A
 * scrim that mounts between presses arms nothing.
 *
 * Watched from module scope, because the press it has to know about
 * starts before any scrim exists — installing the listener from a mount
 * would be too late for exactly the case this is for. Three listeners for
 * the life of the document, all in the capture phase and none of them
 * passive (the `true` is `useCapture`; passive would be
 * `{ capture: true, passive: true }`, and none of these is in the set a
 * browser makes passive by default). They record and clear one reference
 * and call `preventDefault` on nothing.
 *
 * "In flight" is `pointerdown` until `pointerup` or `pointercancel`: the
 * span in which a press can still produce a click nobody has claimed.
 * After it, a mount is an ordinary mount. A fourth listener on `click`
 * was here as a belt and is gone: measured, removing it left both browser
 * suites and this component's own file green, and a branch no case needs
 * is not a guard.
 */
let pressInFlight: Event | null = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => {
      pressInFlight = e;
    },
    true,
  );
  const ended = () => {
    pressInFlight = null;
  };
  document.addEventListener("pointerup", ended, true);
  document.addEventListener("pointercancel", ended, true);
}

/**
 * The one way a popup in this tree is dismissed by pointer.
 *
 * **A press outside the popup closes it, and the click that press
 * produces is swallowed.** Two halves, and the second is the whole
 * requirement: dismissing a popup must not also activate what is under
 * the finger.
 *
 * ## Why it is not the scrim that absorbs the click
 *
 * It was, for three rounds, and each round the arrangement beat it. A
 * scrim can only absorb a tap that lands *on it*, so the mechanism was
 * really "this box is above everything a finger can reach" — a claim
 * about stacking, which nothing can hold. `z-[9]` went under a tab strip;
 * a band written to stop that admitted `z-10`, which ties the same strip
 * and loses on document order; the relation written to stop *that* could
 * not clear a `fixed bottom-0 z-50` selection bar, said nothing about
 * five scrims inside a toolbar's own stacking context, and exempted the
 * shared default. `.claude/rules/review-workflow.md` names the shape:
 * there is no bounded list of ways one box ends up over another — a later
 * rule, a stacking context, document order, a transform, a portal — so a
 * whitelist of positions loses to the next position.
 *
 * The requirement was never geometric. It is about **event order**: a
 * touch's `click` is dispatched after `touchend`, against whatever is
 * topmost then, so a popup that closes on the press leaves that click to
 * the page. Answering the press and then refusing the click it produces
 * says exactly that, and says it whatever is stacked where, on a mouse
 * and on a finger alike. It is also checkable without a browser, because
 * event order is not layout.
 *
 * ## What "outside" is
 *
 * Not a box and not a tier: the popup passed as `children`. A press whose
 * target is inside that subtree is the user working the popup; anything
 * else — the page, a sticky bar over the scrim, the popup's own trigger —
 * dismisses. The trigger is deliberately outside: every trigger here
 * toggles, and its click is swallowed, so pressing it while open closes
 * the popup exactly once.
 *
 * ## Raised by a press, not only dismissed by one
 *
 * The press half has a second case: a popup can be *opened* by a press
 * this component never saw — `useContextMenu`'s 500 ms long-press timer is
 * the one in the tree. Nothing answered that press, so nothing armed for
 * the click it will produce, and a scrim that no longer intercepts cannot
 * stand in. So a scrim that mounts while a press is in flight arms the
 * swallow for it (see `pressInFlight`), which closes the class rather than
 * that one opener.
 *
 * ## The scrim itself is appearance
 *
 * `pointer-events: none`, inline rather than in the class list so that no
 * caller's own classes can turn it back on. It draws the tint below
 * 640px and nothing else; hit-testing it is not part of the mechanism,
 * and the page behind it stays hoverable and scrollable. The named form
 * (`label`) is the exception, because a control a reader can find is what
 * it is for.
 *
 * One thing came back for free. A right-press dismisses and the
 * `contextmenu` that follows reaches the row underneath on its own, so
 * `ContextMenu` retargets to a second row with no re-dispatch, no
 * `elementFromPoint` and no frame of latency — the machinery that used to
 * do that by hand is gone with the interception it was working around.
 *
 * **Rendered in place, and it needs no portal.** A dialog opened from
 * inside the mobile Bottom Sheet does need one — vaul is modal there, so
 * `<body>` gets `pointer-events: none` and every other body child gets
 * `aria-hidden`, and `useDialogPortalTarget()` exists to land it in the
 * host the sheet keeps *inside* `Drawer.Content`, which is the one
 * subtree left interactive. A scrim has no such problem to solve: it is
 * written where the popup is, so the tint lands on the same box the popup
 * is drawn against, and the listener that does the work is on `document`
 * either way.
 *
 * Escape is not here. It goes through `useShortcuts`, which knows what is
 * stacked above what; `escape-listeners.test.ts` records why a listener
 * of one's own is wrong.
 */
export function DismissScrim({
  onDismiss,
  children,
  className = MENU_SCRIM,
  label,
  "data-testid": testId,
}: DismissScrimProps): ReactElement {
  const scrimRef = useRef<HTMLElement | null>(null);
  const dismiss = useRef(onDismiss);

  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    // Raised *by* a press nothing here answered — a long-press, or any
    // opener that acts before the click. The click it produces is still
    // coming and no one has claimed it.
    if (pressInFlight) swallowTheClickThisPressProduces(pressInFlight);

    const onPress = (e: Event) => {
      // The popup is what this component rendered after the scrim, so
      // there is nothing to search for and nothing to keep in step.
      const popup = scrimRef.current?.nextElementSibling ?? null;
      const target = e.target;
      if (popup && target instanceof Node && popup.contains(target)) return;
      swallowTheClickThisPressProduces(e);
      dismiss.current();
    };
    document.addEventListener("pointerdown", onPress, true);
    return () => document.removeEventListener("pointerdown", onPress, true);
  }, []);

  const keepScrim = (el: HTMLElement | null) => {
    scrimRef.current = el;
  };

  const scrim =
    label !== undefined ? (
      <button
        ref={keepScrim}
        type="button"
        aria-label={label}
        {...{ [DISMISS_SCRIM_ATTR]: "" }}
        data-testid={testId}
        className={className}
        // The keyboard's way through: an activation with no press before
        // it arms nothing, so this is the path that closes the panel for
        // a reader on Enter or Space.
        onClick={() => onDismiss()}
      />
    ) : (
      <div
        ref={keepScrim}
        aria-hidden="true"
        {...{ [DISMISS_SCRIM_ATTR]: "" }}
        data-testid={testId}
        className={className}
        style={{ pointerEvents: "none" }}
      />
    );

  return (
    <>
      {scrim}
      {children}
    </>
  );
}
