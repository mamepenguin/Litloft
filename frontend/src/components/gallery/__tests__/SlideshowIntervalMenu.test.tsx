import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";

import { SlideshowIntervalMenu } from "../SlideshowIntervalMenu";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMenu(onOpenChange = vi.fn()) {
  const frame = document.createElement("div");
  document.body.appendChild(frame);
  const ref = createRef<HTMLElement>();
  Object.defineProperty(ref, "current", { value: frame, writable: true });
  const view = render(
    <SlideshowIntervalMenu
      value={5}
      onChange={vi.fn()}
      frameRef={ref}
      label="Slideshow interval"
      closeLabel="Close"
      formatSeconds={(s) => `${s}s`}
      onOpenChange={onOpenChange}
    />,
  );
  return { view, onOpenChange };
}

describe("the slideshow interval menu", () => {
  it("reports opening and closing, so the frame can hold its chrome", () => {
    const { onOpenChange } = renderMenu();
    fireEvent.click(screen.getByLabelText("Slideshow interval"));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByTestId("slideshow-interval-backdrop"));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("reports the close it cannot see: going away with the panel up", () => {
    // The archive's viewer can be closed out from under an open panel —
    // `ArchivePreview` closes it from an effect on `currentPath`, which
    // is URL-backed, so browser Back does it. The hold lives in a hook
    // that outlives this component, so without a cleanup the flag
    // latches `true` and the chrome never withdraws again for the life
    // of the page.
    const { view, onOpenChange } = renderMenu();
    fireEvent.click(screen.getByLabelText("Slideshow interval"));
    onOpenChange.mockClear();

    view.unmount();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says nothing when it goes away already closed", () => {
    // A cleanup that always reported would claim a transition that never
    // happened — the frame would hear "closed" from a panel that was
    // never up. Harmless here, and wrong the moment anything counts.
    const { view, onOpenChange } = renderMenu();
    view.unmount();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
