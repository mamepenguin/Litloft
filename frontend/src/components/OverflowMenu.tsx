"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

interface OverflowMenuProps {
  /**
   * The accessible name. Required, and required to be specific: a screen
   * with two `…` buttons on it needs to say which is which, and "More"
   * on its own says nothing about what it holds (hako
   * `Prwd_iaXmCjWfY24KjFz2`).
   */
  label: string;
  /**
   * Whether the control it fronts is currently on — the drive root's
   * `…` holds Select mode, and the button reads as pressed while it is.
   */
  active?: boolean;
  /**
   * `ActionMenuItem` rows. They receive `close` so a row can dismiss the
   * menu before doing its work: the row that was focused unmounts with
   * the panel, and without moving focus first a keyboard user lands on
   * `<body>` having just chosen something.
   */
  children: (close: () => void) => React.ReactNode;
}

/**
 * The `…` overflow menu: trigger, panel, and the one way it closes.
 *
 * Written once because there were already two copies of it — the drive
 * root's toolbar and the collection header — differing only in what they
 * hold. The panel is anchored to the right of its trigger, which is
 * where a `…` sits on every bar in this app; `AddButton` keeps its own
 * geometry because its trigger is a labelled primary button that can sit
 * at either end of a row (see the `align` note there).
 *
 * No Escape listener. `ShortcutsProvider` is the one place that knows
 * what is stacked above what, and a menu that binds its own `document`
 * keydown answers a press aimed at the dialog in front of it
 * (`__tests__/escape-listeners.test.ts`).
 */
export function OverflowMenu({ label, active, children }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        // 44px on a coarse pointer, as every icon-only control on a bar
        // gets (`Button`'s note on the same floor).
        className={`flex items-center justify-center rounded-lg p-2 transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
          active
            ? "bg-bg-card text-text-primary"
            : "text-text-muted hover:text-text-primary"
        }`}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          {/* A sheet on a phone, a dropdown above 640px — the shape the
              drive root's menu already had, kept because a 180px panel
              hanging off a toolbar button is a poor target at 375px and
              a full-width sheet is not. The scrim dims behind the sheet
              and is transparent on the dropdown, where the page below it
              should stay visible. */}
          <div
            className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label={label}
            className="fixed inset-x-2 bottom-4 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg animate-fade-in-scale sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:max-h-[70vh] sm:min-w-[200px] sm:origin-top-right sm:rounded-xl"
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
