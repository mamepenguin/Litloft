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
    renderControls(nav({ position: null, total: null }));
    expect(readout()).toBeNull();
    expect(prev()).toBeInTheDocument();
    expect(next()).toBeInTheDocument();
  });

  it("drops the readout below 640px and keeps the buttons", () => {
    renderControls(nav());
    expect(readout()).toHaveClass("hidden", "sm:inline");
  });

  it("gives the buttons a 44px target where there is no cursor", () => {
    // On the button itself, not a wrapper: a padded parent leaves the
    // 44px on an element that does not answer the press.
    renderControls(nav());
    for (const button of [prev(), next()]) {
      expect(button).toHaveClass("pointer-coarse:h-11", "pointer-coarse:w-11");
    }
  });

  it("draws no readout for a listing the arrows do not match", () => {
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
