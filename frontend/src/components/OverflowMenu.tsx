"use client";

import { useCallback, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { DismissScrim } from "@/components/DismissScrim";
import { useMenuSurface } from "@/components/ToolbarMenu";

interface OverflowMenuProps {
  /**
   * The accessible name. Required, and required to be specific: a screen
   * with two `…` buttons on it needs to say which is which, and "More"
   * on its own says nothing about what it holds.
   */
  label: string;
  /**
   * `ActionMenuItem` rows. They receive `close` so a row can dismiss the
   * menu before doing its work: the row that was focused unmounts with
   * the panel, and without moving focus first a keyboard user lands on
   * `<body>` having just chosen something.
   */
  children: (close: () => void) => React.ReactNode;
}

/**
 * Escape is answered by a React `onKeyDown` on the box, not by a
 * `document` listener: a listener does not know what is stacked above
 * it and would answer a press aimed at the dialog in front. It stops
 * there, because a press that also reached `ShortcutsProvider` would be
 * answered twice.
 */
export function OverflowMenu({ label, children }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surface = useMenuSurface(open);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <div
      ref={surface.wrapperRef}
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
        className="flex items-center justify-center rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        <MoreHorizontal size={16} />
      </button>
      {open &&
        surface.layer(
          <DismissScrim onDismiss={() => setOpen(false)}>
            <div
              ref={surface.panelRef}
              role="menu"
              aria-label={label}
              className={surface.className}
            >
              {children(close)}
            </div>
          </DismissScrim>,
        )}
    </div>
  );
}
