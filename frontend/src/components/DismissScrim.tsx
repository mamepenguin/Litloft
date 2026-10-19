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
  /** Only for a scrim that is the popup's stated way out; makes it a button. */
  label?: string;
  /** Ignore presses while true. Unmounting the scrim would remount the popup. */
  disabled?: boolean;
  "data-testid"?: string;
}

export const DISMISS_SCRIM_ATTR = "data-dismiss-scrim";

/**
 * A pending swallow is disarmed by `pointercancel`, a keystroke or a second
 * press; otherwise it would eat a later, unrelated click.
 */
let disarm: (() => void) | null = null;

const PRIMARY_BUTTON = 0;

function swallowTheClickThisPressProduces(press: Event): void {
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
 * A popup can mount during a press (a long-press context menu), so that
 * press is tracked from module scope, before any scrim exists.
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
 * Dismisses on the press and swallows the click it produces, rather than
 * relying on the scrim being on top when a touch's click is dispatched.
 * `pointer-events: none` is inline so caller classes cannot undo it.
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
        // Keyboard activation (Enter / Space) arrives with no press.
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
