/**
 * The real components, in the arrangements this unit has been bitten by.
 *
 * Not a copy of them: `DismissScrim`, `ContextMenu` and `useContextMenu`
 * are imported from `src/` and bundled by the repo's own vite, so a change
 * to the primitive changes what the browser measures. That is the whole
 * difference between this file and `e2e-layout/fixtures/popup-dismiss.html`,
 * which hand-writes a copy of the mechanism and therefore stays green when
 * the component stops doing it.
 *
 * What is hand-written here is the *page* — a bar, a strip, a transformed
 * box, a card — because the components that draw those in the app
 * (`SelectionBar`, `InspectorShell`, `MobileInspectorSheet`, `FileCard`)
 * need Next.js, `next-intl` and a backend. The classes come from the same
 * compiled stylesheet the app ships.
 *
 * `ShortcutsProvider` is deliberately absent: its default context is a
 * no-op, so `ContextMenu` renders without it and Escape does nothing here.
 * Escape is `escape-listeners.test.ts`'s and `useShortcuts`'s subject, not
 * this file's.
 */

import { useState, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Trash2 } from "lucide-react";

import { ContextMenu } from "@/components/ContextMenu";
import { DismissScrim } from "@/components/DismissScrim";
import { useContextMenu } from "@/hooks/useContextMenu";

import "../../e2e-layout/fixtures/globals.built.css";

/**
 * A control on the page that must not be activated by the gesture under
 * test, counting its own activations where the spec can read them.
 *
 * `onClick` is React's, delegated at the root container — which is the
 * point. The swallow stops the click at `document` in the capture phase,
 * above the root, so this is a test of the real dispatch path rather than
 * of a listener placed to be convenient.
 */
function PageControl({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      id={id}
      data-clicks="0"
      className={className}
      onClick={(e) => {
        const el = e.currentTarget;
        el.dataset.clicks = String(Number(el.dataset.clicks) + 1);
      }}
    >
      {children}
    </button>
  );
}

const MENU_ROWS = ["Rename", "Move", "Delete"];

function Menu({ onPick }: { onPick: () => void }): ReactElement {
  return (
    <div
      id="menu"
      role="menu"
      className="absolute left-2 top-2 z-30 w-40 rounded-2xl border border-bg-border bg-bg-card py-1 shadow-lg"
    >
      {MENU_ROWS.map((row) => (
        <button
          key={row}
          type="button"
          role="menuitem"
          id={`row-${row}`}
          data-clicks="0"
          className="block w-full px-3 py-2 text-left text-sm text-text-primary"
          onClick={(e) => {
            const el = e.currentTarget;
            el.dataset.clicks = String(Number(el.dataset.clicks) + 1);
            onPick();
          }}
        >
          {row}
        </button>
      ))}
    </div>
  );
}

/** A scrim over a page with nothing else on it — the easy case. */
function Plain(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        underneath
      </PageControl>
      {open && (
        <DismissScrim onDismiss={() => setOpen(false)}>
          <Menu onPick={() => setOpen(false)} />
        </DismissScrim>
      )}
    </>
  );
}

/**
 * `SelectionBar`'s shape: the scrim and the menu live inside a
 * `fixed bottom-0 … z-50` bar, and the bulk actions are in the same bar.
 *
 * Round 5's worst case. No scrim tier could clear the bar, so the tap that
 * dismissed the overflow menu ran a bulk action on every selected file.
 */
function BottomBar(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        underneath
      </PageControl>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-card">
        <PageControl id="bulk" className="block w-full p-2.5 text-text-primary">
          Delete selected
        </PageControl>
        {open && (
          <DismissScrim
            onDismiss={() => setOpen(false)}
            className="fixed inset-0 z-20 sm:hidden"
          >
            <Menu onPick={() => setOpen(false)} />
          </DismissScrim>
        )}
      </div>
    </>
  );
}

/**
 * The mobile sheet's shape: a transformed ancestor, and a sticky strip
 * written after the scrim inside it.
 *
 * `fixed` resolves against the transform, so the scrim covers the drawer
 * rather than the window — the arrangement in which "the scrim is above
 * the chrome" was hardest to state and easiest to get wrong.
 */
function Transformed(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PageControl id="underneath" className="fixed inset-0 z-0 bg-bg-elevated">
        underneath
      </PageControl>
      <div
        id="drawer"
        className="fixed inset-x-0 bottom-0 top-20 z-40 overflow-auto bg-bg-primary"
        style={{ transform: "translate3d(0, 0, 0)" }}
      >
        {open && (
          <DismissScrim onDismiss={() => setOpen(false)}>
            <Menu onPick={() => setOpen(false)} />
          </DismissScrim>
        )}
        <PageControl
          id="tabstrip"
          className="sticky top-0 z-10 block w-full bg-bg-card p-2.5 text-text-primary"
        >
          Tabs
        </PageControl>
      </div>
    </>
  );
}

/**
 * A card wired with the real `useContextMenu`, which opens the menu from a
 * **500 ms timer on `touchstart`**.
 *
 * The popup is raised by a press the primitive never answered, so nothing
 * arms for the click the lift produces — and the scrim is appearance now,
 * so it cannot stand in. Measured before the fix: the long-press opened the
 * menu *and* activated the card, which on a phone is "long-press a file
 * card and land on the file".
 */
function LongPress(): ReactElement {
  const { menuState, close, handlers } = useContextMenu();
  return (
    <>
      <button
        type="button"
        id="card"
        data-clicks="0"
        className="fixed inset-0 z-0 bg-bg-elevated"
        {...handlers}
        onClick={(e) => {
          // What `FileCard`'s wrapper does: it is a link to the file page.
          const el = e.currentTarget;
          el.dataset.clicks = String(Number(el.dataset.clicks) + 1);
        }}
      >
        card
      </button>
      <ContextMenu
        open={menuState.open}
        position={menuState.position}
        items={[{ icon: Trash2, label: "Delete", onClick: () => {} }]}
        onClose={close}
      />
    </>
  );
}

const ARRANGEMENTS: Record<string, () => ReactElement> = {
  plain: Plain,
  "bottom-bar": BottomBar,
  transformed: Transformed,
  "long-press": LongPress,
};

function App(): ReactElement {
  const id = location.hash.slice(1) || "plain";
  const Arrangement = ARRANGEMENTS[id];
  if (!Arrangement) throw new Error(`no arrangement named ${id}`);
  return <Arrangement />;
}

createRoot(document.getElementById("root")!).render(<App />);
document.body.dataset.arrangement = location.hash.slice(1) || "plain";
document.body.dataset.ready = "1";
