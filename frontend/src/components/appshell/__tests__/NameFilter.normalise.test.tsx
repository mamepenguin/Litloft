/**
 * SPEC-CORE-156 I10 as revised: trim, cut to 200 UTF-16 code units, trim
 * again, and never leave half of a surrogate pair in the name the requests
 * carry.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normaliseName, NameFilter } from "@/components/appshell/NameFilter";

function mount() {
  const onApply = vi.fn();
  render(<NameFilter value="" onApply={onApply} alwaysOpen />);
  return {
    onApply,
    input: () =>
      screen.getByRole("searchbox", { name: "Filter by name" }) as HTMLInputElement,
  };
}

const applied = (onApply: ReturnType<typeof vi.fn>) =>
  onApply.mock.calls.map(([name]) => name as string);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SPEC-CORE-156 I10 the cut to 200 code units", () => {
  it("SPEC-CORE-156 I10 199 characters, a space and more applies 199 characters with no trailing space", async () => {
    const { onApply, input } = mount();

    fireEvent.change(input(), { target: { value: `${"x".repeat(199)} more text` } });
    act(() => void vi.advanceTimersByTime(300));

    expect(applied(onApply)).toEqual(["x".repeat(199)]);
  });

  it("SPEC-CORE-156 I10 a surrogate pair cut in half is dropped, and the applied name can be encoded", () => {
    const name = normaliseName(`${"x".repeat(199)}😀y`);

    expect(name).toBe("x".repeat(199));
    expect(Array.from(name)).toHaveLength(199);
    expect(() => encodeURIComponent(name)).not.toThrow();
    expect(new URLSearchParams({ search: name }).toString()).toBe(`search=${"x".repeat(199)}`);
  });

  it("SPEC-CORE-156 I10 a surrogate pair wholly inside the cut is kept", () => {
    const whole = `${"x".repeat(198)}😀`;

    expect(normaliseName(whole)).toBe(whole);
    expect(() => encodeURIComponent(normaliseName(whole))).not.toThrow();
  });
});
