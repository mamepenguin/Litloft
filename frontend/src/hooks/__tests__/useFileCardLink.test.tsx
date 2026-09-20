import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFileCardLink } from "@/hooks/useFileCardLink";
import type { FileItem } from "@/types";

const override = vi.hoisted(() => ({ fn: null as ((id: string) => void) | null }));

vi.mock("@/lib/fileNavigationOverride", () => ({
  useFileNavigationOverride: () => override.fn,
}));

const transitions = vi.hoisted(() => ({
  navigate: vi.fn(),
  around: vi.fn(),
}));

vi.mock("@/lib/viewTransitions", () => ({
  navigateWithTransition: transitions.navigate,
  transitionAroundNavigation: transitions.around,
}));

const file = { id: "f1", drive: "work", folder_path: "Q1" } as FileItem;

/** A card whose picture is the element the open file should grow out of. */
function card(): HTMLElement {
  const wrapper = document.createElement("div");
  const thumb = document.createElement("div");
  thumb.setAttribute("data-file-thumb", "");
  wrapper.appendChild(thumb);
  document.body.appendChild(wrapper);
  return wrapper;
}

const press = (el: HTMLElement) =>
  ({ currentTarget: el, preventDefault: () => {} }) as unknown as React.MouseEvent;

beforeEach(() => {
  transitions.navigate.mockClear();
  transitions.around.mockClear();
  override.fn = null;
  document.body.innerHTML = "";
});

describe("useFileCardLink", () => {
  it("links a card to the file in its own folder, not through /files/{id}", () => {
    const { result } = renderHook(() =>
      useFileCardLink({ file, sortQuery: "?sort=name&order=asc" }),
    );
    expect(result.current.wrapperProps.href).toBe(
      "/drive/work/Q1?file=f1&sort=name&order=asc",
    );
  });

  it("opens a link inside a transition, out of the picture that was pressed", () => {
    const { result } = renderHook(() => useFileCardLink({ file }));
    const wrapper = card();
    const props = result.current.wrapperProps as {
      onClick: (e: React.MouseEvent) => void;
      onNavigate: () => void;
    };

    props.onClick(press(wrapper));
    props.onNavigate();

    expect(transitions.around).toHaveBeenCalledWith("file-open", {
      hero: wrapper.firstElementChild,
    });
  });

  it("opens the in-place selection inside a transition too", () => {
    override.fn = vi.fn();
    const { result } = renderHook(() => useFileCardLink({ file }));
    const wrapper = card();
    const props = result.current.wrapperProps as {
      onClick: (e: React.MouseEvent) => void;
    };

    props.onClick(press(wrapper));

    expect(transitions.navigate).toHaveBeenCalledWith(
      "file-open",
      expect.any(Function),
      { hero: wrapper.firstElementChild },
    );
    transitions.navigate.mock.calls[0][1]();
    expect(override.fn).toHaveBeenCalledWith("f1");
  });

  it("carries no picture when the card has none to give", () => {
    const { result } = renderHook(() => useFileCardLink({ file }));
    const bare = document.createElement("div");
    document.body.appendChild(bare);
    const props = result.current.wrapperProps as {
      onClick: (e: React.MouseEvent) => void;
      onNavigate: () => void;
    };

    props.onClick(press(bare));
    props.onNavigate();

    expect(transitions.around).toHaveBeenCalledWith("file-open", { hero: null });
  });
});
