import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useSelection } from "../useSelection";

describe("useSelection", () => {
  it("toggles selection on and off", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("selects all and clears", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.selectAll(["a", "b", "c"]));
    expect(result.current.count).toBe(3);

    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("selectRange selects from last toggled to target", () => {
    const allIds = ["a", "b", "c", "d", "e"];
    const { result } = renderHook(() => useSelection());

    act(() => result.current.toggle("b"));
    expect(result.current.isSelected("b")).toBe(true);

    act(() => result.current.selectRange(allIds, "d"));
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.isSelected("c")).toBe(true);
    expect(result.current.isSelected("d")).toBe(true);
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.isSelected("e")).toBe(false);
  });

  it("selectRange works in reverse direction", () => {
    const allIds = ["a", "b", "c", "d", "e"];
    const { result } = renderHook(() => useSelection());

    act(() => result.current.toggle("d"));
    act(() => result.current.selectRange(allIds, "b"));
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.isSelected("c")).toBe(true);
    expect(result.current.isSelected("d")).toBe(true);
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.isSelected("e")).toBe(false);
  });

  it("selectRange without prior toggle selects only target", () => {
    const allIds = ["a", "b", "c"];
    const { result } = renderHook(() => useSelection());

    act(() => result.current.selectRange(allIds, "b"));
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it("selectRange adds to existing selection", () => {
    const allIds = ["a", "b", "c", "d", "e"];
    const { result } = renderHook(() => useSelection());

    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("c"));
    act(() => result.current.selectRange(allIds, "e"));
    // c→e selected, plus a still selected
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.isSelected("c")).toBe(true);
    expect(result.current.isSelected("d")).toBe(true);
    expect(result.current.isSelected("e")).toBe(true);
    expect(result.current.isSelected("b")).toBe(false);
  });

  it("clear resets lastToggledId so next selectRange selects only target", () => {
    const allIds = ["a", "b", "c"];
    const { result } = renderHook(() => useSelection());

    act(() => result.current.toggle("a"));
    act(() => result.current.clear());
    act(() => result.current.selectRange(allIds, "c"));
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("c")).toBe(true);
  });
});
