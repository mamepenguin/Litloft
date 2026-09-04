"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "vaul";

import { DialogPortalProvider } from "./DialogPortal";

/**
 * The resting height of the sheet, in px.
 *
 * 56px is a row: the file's name and the controls that act on it. It is
 * the whole reason the sheet rests rather than closes — on a phone the
 * per-file actions used to be somewhere in a column the reader had to
 * find, and now they are in the same place on every file.
 */
export const SHEET_PEEK_PX = 56;

/**
 * peek, half, full.
 *
 * A tuple rather than three numbers passed around: vaul identifies the
 * active point by value, so the strings and fractions here are also the
 * identity of each state. `SHEET_SNAP_PEEK` etc. name them so nothing
 * downstream compares against a literal.
 */
export const SHEET_SNAP_PEEK = `${SHEET_PEEK_PX}px`;
export const SHEET_SNAP_HALF = 0.5;
export const SHEET_SNAP_FULL = 0.9;
export const SHEET_SNAP_POINTS: (number | string)[] = [
  SHEET_SNAP_PEEK,
  SHEET_SNAP_HALF,
  SHEET_SNAP_FULL,
];

export type SheetSnap = number | string;

/** Whether a snap point is one of the two that cover the page. */
export function isSheetExpanded(snap: SheetSnap): boolean {
  return snap !== SHEET_SNAP_PEEK;
}

/**
 * Bottom Sheet that carries the inspector on a phone.
 *
 * Three states, not two. It rests at `peek` rather than closing, so the
 * title and the action row are permanently on screen; `half` and `full`
 * bring the rest of the inspector up over the page.
 *
 * **`modal` only when expanded.** vaul's modal mode puts
 * `pointer-events: none` on `<body>` and `aria-hidden` on every other
 * body child (`DESIGN.md` §Layering). At rest that would make the page
 * behind it unscrollable and unreadable to a screen reader, which is
 * the opposite of what a 56px strip is for.
 *
 * There is no closed state, so a dismiss gesture collapses to `peek`
 * rather than closing.
 *
 * Sits in the surface tier (DESIGN.md §Layering), above the sidebar
 * overlay and mini-player but *below* modal dialogs — it hosts the file
 * `[...]` menu, so anything that menu opens has to paint above the sheet
 * it was launched from. Correct stacking is necessary but not
 * sufficient there, which is what the dialog host at the bottom is for.
 *
 * Built on vaul — chosen over hand-rolled CSS because the sheet motion,
 * drag and focus trap are a UX expectation from native messaging apps
 * (hako sFXCwZDluTPZZkbYuozwJ).
 */
export function MobileInspectorSheet({
  snap,
  onSnapChange,
  peek,
  children,
}: {
  snap: SheetSnap;
  onSnapChange: (next: SheetSnap) => void;
  /**
   * The 56px row. Drawn by the sheet rather than scrolled to, because
   * at rest it is the only part on screen and a scroll position is not
   * a layout.
   */
  peek: ReactNode;
  children: ReactNode;
}): ReactElement | null {
  const t = useTranslations("inspector");
  const [dialogHost, setDialogHost] = useState<HTMLDivElement | null>(null);
  const expanded = isSheetExpanded(snap);

  return (
    <Drawer.Root
      open
      snapPoints={SHEET_SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={(next) => onSnapChange(next ?? SHEET_SNAP_PEEK)}
      modal={expanded}
      // A dismiss gesture — the backdrop, Escape, a swipe down — means
      // "get out of my way", and the sheet's way of doing that is to
      // rest, not to vanish. Refusing to be dismissible instead would
      // leave a reader who tapped the dim with nothing happening.
      onOpenChange={(next) => {
        if (!next) onSnapChange(SHEET_SNAP_PEEK);
      }}
    >
      <Drawer.Portal>
        {/* Only over the page it is actually covering. A dim behind a
            56px strip would darken a page the reader is still using. */}
        {expanded && (
          <Drawer.Overlay
            data-testid="mobile-inspector-overlay"
            className="fixed inset-0 z-[45] bg-black/50"
          />
        )}
        <Drawer.Content
          data-testid="mobile-inspector-sheet"
          data-snap={expanded ? "expanded" : "peek"}
          className="fixed bottom-0 left-0 right-0 z-[46] flex h-[90vh] max-h-[90vh] flex-col rounded-t-2xl border-t border-bg-border bg-bg-card outline-none"
        >
          <Drawer.Title className="sr-only">{t("title")}</Drawer.Title>
          {/* Visually hidden description for assistive tech — vaul
              (Radix Dialog) requires either a Description or an explicit
              `aria-describedby={undefined}` to silence the
              accessibility warning. */}
          <Drawer.Description className="sr-only">
            {t("sheetDescription")}
          </Drawer.Description>
          <div
            data-testid="mobile-inspector-peek"
            style={{ height: `${SHEET_PEEK_PX}px` }}
            className="flex shrink-0 items-center gap-2 px-4"
          >
            {peek}
          </div>
          {/* Everything below the peek row exists at every state; at
              rest it is simply off the bottom of the screen. Mounting it
              on expand instead would re-fetch the comments and lose the
              transcript's place every time the reader looked at the
              file's tags. `inert` while at rest so a keyboard or screen
              reader does not walk into the part that is off-screen. */}
          <div
            className="min-h-0 flex-1 overflow-auto"
            inert={!expanded}
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            <DialogPortalProvider target={dialogHost}>
              {children}
            </DialogPortalProvider>
          </div>
          {/* Host for dialogs opened from inside the sheet. vaul is
              `modal` while expanded, so it puts `pointer-events: none`
              on <body> and `aria-hidden` on every other body child — a
              dialog portalled beside the sheet would be stacked
              correctly and still be inert. Landing it here keeps it
              inside the one subtree vaul leaves interactive. */}
          <div ref={setDialogHost} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
