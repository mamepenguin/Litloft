"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { MENU_SURFACE } from "@/components/ToolbarMenu";

interface OverflowMenuProps {
  /**
   * The accessible name. Required, and required to be specific: a screen
   * with two `…` buttons on it needs to say which is which, and "More"
   * on its own says nothing about what it holds (hako
   * `Prwd_iaXmCjWfY24KjFz2`).
   */
  label: string;
  /**
   * Whether something inside is currently on — the drive root's `…`
   * holds Select mode. Visual only: the state belongs to the row, which
   * carries `aria-pressed`, and a trigger that is already
   * `aria-haspopup` would be claiming to be two controls.
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
 * Escape is answered by a React `onKeyDown` on the box, not by a
 * `document` listener: a listener does not know what is stacked above
 * it and would answer a press aimed at the dialog in front. It stops
 * there, because a press that also reached `ShortcutsProvider` would be
 * answered twice. `ToolbarMenu` records the same reasoning, and
 * `escape-listeners.test.ts` permits exactly this shape.
 *
 * The surface is `MENU_SURFACE` — a sheet below 640px, a right-anchored
 * dropdown above it — because every other menu on a bar in this app is
 * that surface, and a `…` rendering two ways on two screens that hold
 * the same rows is the drift this component exists to end. `AddButton`
 * is the one menu that does not use it, and says why: it anchors left.
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
    <div
      ref={menuRef}
      className="relative"
      onKeyDown={(e) => {
        if (!open || e.key !== "Escape") return;
        e.stopPropagation();
        close();
      }}
    >
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
          {/* The scrim dims behind the sheet and is transparent under the
              dropdown, where the page below should stay visible. */}
          <div
            className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div role="menu" aria-label={label} className={MENU_SURFACE}>
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
