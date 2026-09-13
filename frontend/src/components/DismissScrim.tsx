"use client";

import { useEffect, useRef, type ReactElement } from "react";

/**
 * Dimmed below 640px, where the popup is a bottom sheet and the page
 * behind it is not part of the interaction; transparent above it, where
 * the popup is a small panel anchored to its trigger.
 */
export const MENU_SCRIM = "fixed inset-0 z-30 bg-black/30 sm:bg-transparent";

export interface DismissScrimProps {
  onDismiss: () => void;
  /** Rendered immediately after the scrim, as its sibling. */
  children: ReactElement;
  className?: string;
  /**
   * Only for a scrim that is the popup's *stated* way out. A menu whose
   * scrim is transparent gains nothing from a tab stop that reads as a
   * control and does nothing but close.
   */
  label?: string;
  /**
   * Ignore presses while true, keeping the popup mounted. Rendering the
   * popup without the scrim instead would change the element at its
   * position and remount everything inside it.
   */
  disabled?: boolean;
  "data-testid"?: string;
}

export const DISMISS_SCRIM_ATTR = "data-dismiss-scrim";

/**
 * `capture` on `document` is the first listener in the path, so
 * `stopPropagation` there keeps the click from every element handler and
 * from React's own root listener, and `preventDefault` keeps a link from
 * navigating and a label from toggling its control. Both are needed:
 * stopping propagation alone leaves the default action.
 *
 * A press that could have produced a click but did not is abandoned by
 * whatever says so: a `pointercancel` (the touch became a scroll), a
 * keystroke, or a second press. Without that, a swallow sits armed and
 * eats some later, unrelated click.
 */
let disarm: (() => void) | null = null;

const PRIMARY_BUTTON = 0;

function swallowTheClickThisPressProduces(press: Event): void {
  // A press that produces no click has nothing to swallow, and arming for
  // one leaves the swallow sitting until something abandons it.
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
 * **A popup can be raised *by* a press this component never saw** —
 * `useContextMenu` opens `ContextMenu` from a 500 ms timer on
 * `touchstart` — so a popup that mounts *during* a press arms the swallow
 * for that press.
 *
 * Watched from module scope, because the press it has to know about
 * starts before any scrim exists — installing the listener from a mount
 * would be too late for exactly the case this is for.
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
 * The scrim does not absorb the click. A scrim can only absorb a tap that
 * lands *on it*, which is a claim about stacking that nothing can hold; a
 * touch's `click` is dispatched after `touchend`, against whatever is
 * topmost then, so the press is answered and the click it produces is
 * refused.
 *
 * The trigger is deliberately outside: every trigger here toggles, and its
 * click is swallowed, so pressing it while open closes the popup exactly
 * once.
 *
 * `pointer-events: none` is inline rather than in the class list so that
 * no caller's own classes can turn it back on.
 *
 * Escape is not here. It goes through `useShortcuts`, which knows what is
 * stacked above what.
 */
export function DismissScrim({
  onDismiss,
  children,
  className = MENU_SCRIM,
  label,
  disabled = false,
  "data-testid": testId,
}: DismissScrimProps): ReactElement {
  const scrimRef = useRef<HTMLElement | null>(null);
  const dismiss = useRef(onDismiss);
  const ignoring = useRef(disabled);

  useEffect(() => {
    dismiss.current = onDismiss;
    ignoring.current = disabled;
  });

  useEffect(() => {
    if (pressInFlight) swallowTheClickThisPressProduces(pressInFlight);

    const onPress = (e: Event) => {
      if (ignoring.current) return;
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
