import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";
import { DirtyBlocker } from "../DirtyBlocker";

beforeEach(() => {
  navigationGuard.reset();
  dirtyRegistry.reset();
});

afterEach(() => {
  cleanup();
  navigationGuard.reset();
  dirtyRegistry.reset();
});

describe("DirtyBlocker", () => {
  it("does not render the dialog while no navigation is queued", () => {
    render(<DirtyBlocker />);
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("renders the dialog when a queued request lands", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    render(<DirtyBlocker />);
    act(() => {
      navigationGuard.request(vi.fn());
    });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("clicking 'Discard and navigate' calls confirm() which fires the queued action", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    render(<DirtyBlocker />);
    const fn = vi.fn();
    act(() => {
      navigationGuard.request(fn);
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Discard and navigate" }),
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(navigationGuard.getPending()).toBeNull();
  });

  it("clicking 'Cancel' drops the queued action", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    render(<DirtyBlocker />);
    const fn = vi.fn();
    act(() => {
      navigationGuard.request(fn);
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fn).not.toHaveBeenCalled();
    expect(navigationGuard.getPending()).toBeNull();
  });

  it("popstate guard: pushes back the URL and queues a back() when dirty", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const backSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    render(<DirtyBlocker />);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(pushStateSpy).toHaveBeenCalled();
    expect(navigationGuard.getPending()).not.toBeNull();
    act(() => {
      navigationGuard.confirm();
    });
    expect(backSpy).toHaveBeenCalledTimes(1);
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
  });

  it("popstate guard: ignored when nothing is dirty", () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    render(<DirtyBlocker />);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(pushStateSpy).not.toHaveBeenCalled();
    pushStateSpy.mockRestore();
  });

  it("beforeunload guard: prevents default and sets returnValue when dirty", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    render(<DirtyBlocker />);
    const e = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
  });

  it("beforeunload guard: ignored when nothing is dirty", () => {
    render(<DirtyBlocker />);
    const e = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(false);
  });
});
