/**
 * The visible prev / next pair and its `n / N` readout.
 *
 * The arrow keys have walked to the neighbouring file since long before
 * this; what is new is a handle on the same walk. So the assertions
 * that matter are (a) the buttons go through the *same* navigate
 * callbacks the keys do, and (b) the readout never claims a file the
 * buttons cannot reach.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FileNavControls } from "../FileNavControls";
import { FileNavProvider, type FileNavState } from "@/lib/fileNavContext";

function nav(overrides: Partial<FileNavState> = {}): FileNavState {
  return {
    prevId: "before",
    nextId: "after",
    position: 12,
    total: 995,
    navigatePrev: vi.fn(),
    navigateNext: vi.fn(),
    ...overrides,
  };
}

function renderControls(state: FileNavState) {
  return render(
    <FileNavProvider value={state}>
      <FileNavControls />
    </FileNavProvider>,
  );
}

const prev = () => screen.getByTestId("file-nav-prev");
const next = () => screen.getByTestId("file-nav-next");
const readout = () => screen.queryByTestId("file-nav-position");

describe("FileNavControls", () => {
  it("draws the place in the folder between the two arrows", () => {
    renderControls(nav());
    expect(readout()).toHaveTextContent("12 / 995");
  });

  it("moves through the same callbacks the arrow keys use", () => {
    const state = nav();
    renderControls(state);

    fireEvent.click(prev());
    fireEvent.click(next());

    expect(state.navigatePrev).toHaveBeenCalledTimes(1);
    expect(state.navigateNext).toHaveBeenCalledTimes(1);
  });

  it("disables the end it is at rather than hiding it", () => {
    renderControls(nav({ prevId: null }));
    expect(prev()).toBeDisabled();
    expect(next()).not.toBeDisabled();
  });

  it("disables the other end at the far side", () => {
    renderControls(nav({ nextId: null }));
    expect(next()).toBeDisabled();
    expect(prev()).not.toBeDisabled();
  });

  it("draws no readout at all when the ordering cannot rank the file", () => {
    // `/neighbors` reports both halves null together — a file that is
    // not in the sequence has no place in it and no reason to report
    // its size. Half a fraction is not a smaller readout, it is a wrong
    // one.
    renderControls(nav({ position: null, total: null }));
    expect(readout()).toBeNull();
    // The buttons stay, so the row does not change shape.
    expect(prev()).toBeInTheDocument();
    expect(next()).toBeInTheDocument();
  });

  it("drops the readout below 640px and keeps the buttons", () => {
    // jsdom loads no stylesheet, so the width rule is asserted as the
    // class that carries it — `00-basis.md`: a row of controls does not
    // wrap, the thing that does not fit is dropped.
    renderControls(nav());
    expect(readout()).toHaveClass("hidden", "sm:inline");
  });

  it("gives the buttons a 44px target where there is no cursor", () => {
    // On the button itself, not a wrapper: a padded parent leaves the
    // 44px on an element that does not answer the press. Phase 3 shipped
    // that mistake once already.
    renderControls(nav());
    for (const button of [prev(), next()]) {
      expect(button).toHaveClass("pointer-coarse:h-11", "pointer-coarse:w-11");
    }
  });

  it("draws no readout for a listing the arrows do not match", () => {
    // The ruling: a count is drawn only when the readout, the arrows and
    // the listing are the same sequence. `useFileNav` nulls both halves
    // when they are not, so this component needs no rule of its own —
    // but a null `position` beside a real `total` would still format, so
    // the pair is what is asserted.
    renderControls(nav({ position: null, total: 995 }));
    expect(readout()).toBeNull();
    renderControls(nav({ position: 12, total: null }));
    expect(readout()).toBeNull();
  });

  it("draws nothing where no host published a walk", () => {
    const { container } = render(<FileNavControls />);
    expect(container).toBeEmptyDOMElement();
  });
});
