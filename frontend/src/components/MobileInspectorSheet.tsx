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
 *
 * `DESIGN.md` §Layering states it, and the parity test binds the two.
 */
export const SHEET_PEEK_PX = 56;

export const SHEET_SNAP_PEEK = "peek";
export const SHEET_SNAP_HALF = 0.5;
export const SHEET_SNAP_FULL = 0.9;

/**
 * What vaul is given, which is **not** every state the sheet has.
 *
 * `peek` is not a snap point. The drawer is not mounted there at all —
 * see the note on modality below — so the strip is drawn outside it and
 * vaul only ever sees the two states that cover the page.
 */
export const SHEET_SNAP_POINTS: (number | string)[] = [
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
 * **The drawer is mounted only while expanded, and the peek strip is
 * drawn outside it.** This is not a preference. vaul renders Radix's
 * `Dialog.Root` with `open`, `defaultOpen` and `onOpenChange` and
 * nothing else — its own `modal` prop never reaches Radix, which
 * therefore defaults to modal and calls `hideOthers()` on every other
 * body child. A drawer mounted at rest puts `aria-hidden="true"` on the
 * whole application, permanently, on every file page a phone opens. The
 * page stays scrollable, so nothing looks wrong; it is simply gone for
 * anyone using a screen reader.
 *
 * The cost is that the content below the strip unmounts on collapse and
 * refetches on the way back up. That is what `develop` already did with
 * a closed sheet, and it is the cheaper of the two prices.
 *
 * `fadeFromIndex={0}` because vaul defaults it to the *last* snap point,
 * which would leave `half` — the state the toggle actually opens —
 * covering the page with no dim to say so.
 *
 * A dismiss gesture collapses to `peek`; there is no closed state to
 * dismiss to, and refusing the gesture would leave a reader who tapped
 * the dim with nothing happening.
 *
 * Sits in the surface tier (`DESIGN.md` §Layering), above the sidebar
 * overlay and mini player but below modal dialogs — it hosts the file
 * `[...]` menu, so anything that menu opens has to paint above the sheet
 * it was launched from. Correct stacking is necessary but not
 * sufficient, which is what the dialog host at the bottom is for.
 */
export function MobileInspectorSheet({
  snap,
  onSnapChange,
  peek,
  children,
}: {
  snap: SheetSnap;
  onSnapChange: (next: SheetSnap) => void;
  /** The 56px row: the file's name and the controls that act on it. */
  peek: ReactNode;
  children: ReactNode;
}): ReactElement | null {
  const t = useTranslations("inspector");
  const [dialogHost, setDialogHost] = useState<HTMLDivElement | null>(null);
  const expanded = isSheetExpanded(snap);

  if (!expanded) {
    return (
      <div
        data-testid="mobile-inspector-peek"
        style={{ height: `${SHEET_PEEK_PX}px` }}
        // Floating surface (`DESIGN.md` §Layering), the tier
        // bottom-anchored mobile chrome belongs to. Below the sheet it
        // becomes, so the two never argue during the transition.
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 border-t border-bg-border bg-bg-card px-4"
      >
        {peek}
      </div>
    );
  }

  return (
    <Drawer.Root
      open
      snapPoints={SHEET_SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={(next) => onSnapChange(next ?? SHEET_SNAP_HALF)}
      fadeFromIndex={0}
      modal
      onOpenChange={(next) => {
        if (!next) onSnapChange(SHEET_SNAP_PEEK);
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          data-testid="mobile-inspector-overlay"
          className="fixed inset-0 z-[45] bg-black/50"
        />
        <Drawer.Content
          data-testid="mobile-inspector-sheet"
          data-snap={snap === SHEET_SNAP_FULL ? "full" : "half"}
          className="fixed bottom-0 left-0 right-0 z-[46] flex h-[90vh] max-h-[90vh] flex-col rounded-t-2xl border-t border-bg-border bg-bg-card outline-none"
        >
          {/* Restored deliberately: the guide tells readers they can
              drag the sheet to full, and a sheet with no handle does not
              say so. `Drawer.Handle` is also vaul's own drag affordance,
              so tapping it cycles the snap points. */}
          <Drawer.Handle className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-bg-border" />
          <Drawer.Title className="sr-only">{t("title")}</Drawer.Title>
          {/* Visually hidden description for assistive tech — vaul
              (Radix Dialog) requires either a Description or an explicit
              `aria-describedby={undefined}` to silence the warning. */}
          <Drawer.Description className="sr-only">
            {t("sheetDescription")}
          </Drawer.Description>
          <div
            data-testid="mobile-inspector-content"
            className="min-h-0 flex-1 overflow-auto"
            style={{
              // vaul keeps the content at its full height and slides it,
              // so at `half` the bottom 40vh of this box is below the
              // screen and cannot be scrolled to. Bounding the scroller
              // by the active snap is what puts its end back on screen.
              maxHeight: snap === SHEET_SNAP_FULL ? "90vh" : "50vh",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            <DialogPortalProvider target={dialogHost}>
              {children}
            </DialogPortalProvider>
          </div>
          {/* Host for dialogs opened from inside the sheet. vaul is
              modal, so `pointer-events: none` on <body> and
              `aria-hidden` on every other body child — a dialog
              portalled beside the sheet would be stacked correctly and
              still be inert. Landing it here keeps it inside the one
              subtree vaul leaves interactive. */}
          <div ref={setDialogHost} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
