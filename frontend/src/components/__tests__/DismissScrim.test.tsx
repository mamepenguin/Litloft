import { useState } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  DISMISS_SCRIM_ATTR,
  DismissScrim,
  MENU_SCRIM,
} from "../DismissScrim";
import { openScrim } from "@/__tests__/helpers/dismissScrim";

/**
 * The mechanism, driven directly rather than through one of the sixteen
 * popups that mount it.
 *
 * **A press outside the popup dismisses it, and the click that press
 * produces is swallowed.** Everything below is one of those two halves,
 * or the boundary of the swallow.
 *
 * ## Why this file can hold the claim, where the old one could not
 *
 * The property is **event order**, not geometry. jsdom lays nothing out
 * and hit-tests nothing, and under this mechanism it does not have to:
 * which box a press lands on is not part of the answer — the target being
 * outside the popup subtree is. So `pointerdown` at a node, then `click`
 * at a node, is the whole sequence a browser would produce, and the thing
 * being asserted is what each does.
 *
 * What jsdom still cannot say is that a *real* touch produces that order,
 * or that a real page reaches the same outcome with chrome stacked over
 * the scrim. `e2e-layout/popup-dismiss.spec.ts` measures both in Chromium
 * with `page.touchscreen.tap`, across stacking arrangements, and the
 * parity test ties its fixture to this component.
 */

/** A page control that must not be activated by a dismissing tap. */
function pageUnderneath(): { el: HTMLElement; clicks: () => number } {
  const el = document.createElement("button");
  let clicks = 0;
  el.addEventListener("click", () => {
    clicks += 1;
  });
  document.body.appendChild(el);
  return { el, clicks: () => clicks };
}

/** The sequence a tap produces, on the element it lands on. */
function tap(el: HTMLElement): void {
  fireEvent.pointerDown(el);
  fireEvent.click(el);
}

function Popup(): React.ReactElement {
  return (
    <div role="menu">
      <button type="button">row</button>
    </div>
  );
}

describe("DismissScrim", () => {
  afterEach(() => {
    // A browser always ends a press; `fireEvent.pointerDown` alone does
    // not. The primitive tracks whether a press is in flight — that is
    // what arms the swallow for a popup raised *by* one — so a case that
    // leaves one open would hand it to the next case, which no real
    // gesture does.
    fireEvent.pointerUp(document.body);
  });

  it("closes on a press outside the popup", () => {
    const onDismiss = vi.fn();
    render(
      <DismissScrim onDismiss={onDismiss}>
        <Popup />
      </DismissScrim>,
    );

    fireEvent.pointerDown(document.body);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("leaves a press inside the popup alone", () => {
    // The other half of "outside": working the popup is not dismissing
    // it. Without this the component would close on its own menu rows and
    // swallow the click that runs them.
    const onDismiss = vi.fn();
    render(
      <DismissScrim onDismiss={onDismiss}>
        <Popup />
      </DismissScrim>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "row" }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("swallows the click that dismissing press produces", () => {
    // The requirement, stated as the thing it forbids: the tap that
    // dismissed a menu must not also press what was under the finger.
    const page = pageUnderneath();
    const onDismiss = vi.fn();
    render(
      <DismissScrim onDismiss={onDismiss}>
        <Popup />
      </DismissScrim>,
    );

    tap(page.el);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(page.clicks()).toBe(0);
  });

  it("refuses the click's default action as well as its listeners", () => {
    // `stopPropagation` alone leaves the default: a link would navigate
    // and a label would toggle its control, with no listener involved.
    const page = pageUnderneath();
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );

    fireEvent.pointerDown(page.el);
    // `fireEvent` returns false when something called `preventDefault`.
    expect(fireEvent.click(page.el)).toBe(false);
  });

  it("swallows one click, not every click after it", () => {
    // One press, one click taken. The swallow is scoped to the
    // interaction that armed it, so anything after belongs to the page —
    // measured without a second press, because a second press through a
    // still-mounted scrim would arm the swallow again and hide this.
    const page = pageUnderneath();
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );

    fireEvent.pointerDown(page.el);
    fireEvent.click(page.el);
    expect(page.clicks()).toBe(0);

    fireEvent.click(page.el);
    expect(page.clicks()).toBe(1);
  });

  it("is done with the page once the popup has closed", () => {
    // The realistic shape of the case above: the caller closes, the scrim
    // goes, and the next tap is an ordinary tap. Without this, "swallows
    // one click" would be consistent with a component that keeps a
    // listener alive for the life of the document.
    const page = pageUnderneath();
    function Caller(): React.ReactElement {
      const [open, setOpen] = useState(true);
      return open ? (
        <DismissScrim onDismiss={() => setOpen(false)}>
          <Popup />
        </DismissScrim>
      ) : (
        <span>closed</span>
      );
    }
    render(<Caller />);

    tap(page.el);
    expect(page.clicks()).toBe(0);
    expect(screen.getByText("closed")).toBeInTheDocument();

    tap(page.el);
    expect(page.clicks()).toBe(1);
  });

  it("abandons the swallow when the press produces no click", () => {
    // A right-press dismisses and never produces a click, so the swallow
    // would sit armed and eat some later, unrelated one. Each of these is
    // a way of learning the click is not coming.
    for (const abandon of [
      () => fireEvent.pointerCancel(document.body),
      () => fireEvent.keyDown(document.body, { key: "a" }),
    ]) {
      const page = pageUnderneath();
      const view = render(
        <DismissScrim onDismiss={vi.fn()}>
          <Popup />
        </DismissScrim>,
      );

      fireEvent.pointerDown(page.el);
      abandon();
      fireEvent.click(page.el);

      expect(page.clicks()).toBe(1);
      view.unmount();
      page.el.remove();
    }
  });

  it("swallows for the press that raised it, when it mounts during one", () => {
    // A popup can be opened *by* a press this component never answered —
    // `useContextMenu` opens `ContextMenu` from a 500 ms long-press timer,
    // so the press is half over before a scrim exists. Nothing armed for
    // the click that lift will produce, and appearance cannot block it:
    // measured in a real browser, long-pressing a file card opened its
    // menu and navigated to the file.
    const page = pageUnderneath();

    fireEvent.pointerDown(page.el);
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    fireEvent.pointerUp(page.el);
    fireEvent.click(page.el);

    expect(page.clicks()).toBe(0);
  });

  it("arms nothing for a press that cannot produce a click", () => {
    // A right-press raises `contextmenu`, never `click` — and
    // `useContextMenu` opens its menu from that event, while the press is
    // still in flight, so the mount-time arming meets one every time a
    // context menu is raised by mouse. Arming there would leave a swallow
    // sitting for a click that never comes, to be spent on someone
    // else's. Measured in Chromium by review before this guard existed:
    // right-press to open the menu, then a click on the page — eaten.
    const page = pageUnderneath();

    // Dispatched by hand: jsdom implements no `PointerEvent`, so
    // `fireEvent.pointerDown` builds a bare `Event` with no `button` at
    // all — the property this turns on. A `MouseEvent` under the pointer
    // event's name carries the `button` a browser's would.
    page.el.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 2 }),
    );
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    fireEvent.click(page.el);

    expect(page.clicks()).toBe(1);
  });

  it("swallows nothing when it mounts between presses", () => {
    // The other side of that, and the reason the window is `pointerdown`
    // to `pointerup` rather than "the last press we saw": a popup opened
    // by a keystroke, a timer or a completed click has no click of its own
    // coming, and a swallow armed then would eat someone else's.
    const page = pageUnderneath();

    fireEvent.pointerDown(page.el);
    fireEvent.pointerUp(page.el);
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    fireEvent.click(page.el);

    expect(page.clicks()).toBe(1);
  });

  it("keeps swallowing after the popup it guarded is gone", () => {
    // The click arrives after the press, by which time React has
    // committed the unmount — so the swallow cannot live on the component
    // that armed it, and does not.
    const page = pageUnderneath();
    const view = render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );

    fireEvent.pointerDown(page.el);
    view.unmount();
    fireEvent.click(page.el);

    expect(page.clicks()).toBe(0);
  });

  it("stops answering presses once it is unmounted", () => {
    const onDismiss = vi.fn();
    const view = render(
      <DismissScrim onDismiss={onDismiss}>
        <Popup />
      </DismissScrim>,
    );
    view.unmount();

    fireEvent.pointerDown(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders the popup it was given, after the dim", () => {
    // The adjacency the mechanism reads: "inside" is the element drawn
    // after the scrim, and the component is what draws it, so the two
    // cannot drift apart at a call site.
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );

    expect(openScrim().nextElementSibling).toBe(screen.getByRole("menu"));
  });

  it("is not in the way of a pointer", () => {
    // Appearance only. Hit-testing the scrim is not part of the
    // mechanism, and a caller's own class list must not be able to turn
    // interception back on — which is why this is an inline style and not
    // a class.
    render(
      <DismissScrim onDismiss={vi.fn()} className="fixed inset-0 z-[9]">
        <Popup />
      </DismissScrim>,
    );

    expect(openScrim().style.pointerEvents).toBe("none");
  });

  it("takes the menu surface's box unless given one", () => {
    const { rerender } = render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    expect(openScrim().className).toBe(MENU_SCRIM);

    rerender(
      <DismissScrim onDismiss={vi.fn()} className="fixed inset-0 z-49">
        <Popup />
      </DismissScrim>,
    );
    expect(openScrim().className).toBe("fixed inset-0 z-49");
  });

  it("covers the whole of its containing block", () => {
    // What the dim has to be to read as a dim. The tier is not asserted
    // anywhere any more: no behaviour depends on it.
    expect(MENU_SCRIM.split(" ")).toContain("inset-0");
    expect(MENU_SCRIM.split(" ")).toContain("fixed");
  });

  it("is inert to assistive technology unless it is named", () => {
    const { rerender } = render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    expect(openScrim().tagName).toBe("DIV");
    expect(openScrim()).toHaveAttribute("aria-hidden", "true");

    // Named: the over-frame settings panel, where there is no page edge
    // to say where the panel stops, so the area that dismisses it is a
    // control rather than dead space.
    rerender(
      <DismissScrim onDismiss={vi.fn()} label="Close settings">
        <Popup />
      </DismissScrim>,
    );
    expect(openScrim().tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Close settings" })).toBe(
      openScrim(),
    );
  });

  it("closes from the keyboard when it is a named control", () => {
    // A keyboard activation raises a `click` with no press before it, so
    // it arms no swallow and nothing takes it. That is the path this
    // `onClick` exists for; the pointer never reaches it.
    const onDismiss = vi.fn();
    render(
      <DismissScrim onDismiss={onDismiss} label="Close settings">
        <Popup />
      </DismissScrim>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hands a right-press's own menu event to whatever is under it", () => {
    // Retargeting, which used to be a `preventDefault` plus an
    // `elementFromPoint` re-dispatch a frame later. The scrim intercepts
    // nothing now, so `contextmenu` reaches the row by itself and
    // `ContextMenu` reopens there: the machinery is gone, and this is
    // what says the behaviour is not.
    const page = pageUnderneath();
    const raised = vi.fn();
    page.el.addEventListener("contextmenu", raised);
    const onDismiss = vi.fn();
    render(
      <DismissScrim onDismiss={onDismiss}>
        <Popup />
      </DismissScrim>,
    );

    fireEvent.pointerDown(page.el, { button: 2 });
    fireEvent.contextMenu(page.el);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(raised).toHaveBeenCalledTimes(1);
  });

  it("marks itself so a popup's dismissal surface is findable", () => {
    render(
      <DismissScrim onDismiss={vi.fn()} data-testid="probe">
        <Popup />
      </DismissScrim>,
    );
    const scrim = screen.getByTestId("probe");
    expect(scrim).toHaveAttribute(DISMISS_SCRIM_ATTR);
  });
});
