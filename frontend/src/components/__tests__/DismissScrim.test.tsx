import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  DISMISS_SCRIM_ATTR,
  DismissScrim,
  MENU_SCRIM,
} from "../DismissScrim";
import { openScrim } from "@/__tests__/helpers/dismissScrim";

function pageUnderneath(): { el: HTMLElement; clicks: () => number } {
  const el = document.createElement("button");
  let clicks = 0;
  el.addEventListener("click", () => {
    clicks += 1;
  });
  document.body.appendChild(el);
  return { el, clicks: () => clicks };
}

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
  // No press lift of its own: the shared test setup ends the gesture after
  // every test in the suite.
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
    // No second press: through a still-mounted scrim it would arm the
    // swallow again and hide this.
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

  it("abandons a stale swallow when a second press starts", () => {
    // It needs a popup that actually closes, so that the second press
    // meets no scrim and cannot simply re-arm.
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

    // Arms, and leaves it armed: no click follows this press.
    fireEvent.pointerDown(page.el);
    expect(screen.getByText("closed")).toBeInTheDocument();

    fireEvent.pointerDown(page.el);
    const notPrevented = fireEvent.click(page.el);

    expect(page.clicks()).toBe(1);
    expect(notPrevented).toBe(true);
  });

  it("abandons the swallow when the press produces no click", () => {
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
    const page = pageUnderneath();

    // Dispatched by hand: `fireEvent.pointerDown` here builds a bare `Event`
    // with no `button`, the property this turns on.
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
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );

    expect(openScrim().nextElementSibling).toBe(screen.getByRole("menu"));
  });

  it("is not in the way of a pointer", () => {
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
