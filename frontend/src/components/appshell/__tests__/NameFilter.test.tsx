/**
 * SPEC-CORE-156: the core name filter part, through its contract. The part is
 * imported per test so that each one fails on its own while the part is
 * missing.
 */

import type { ComponentType } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type NameFilterProps = {
  value: string;
  onApply: (name: string) => void;
  alwaysOpen?: boolean;
  onLeavePending?: (name: string) => void;
  scopeKey?: string;
};

async function part(): Promise<ComponentType<NameFilterProps>> {
  const path = "@/components/appshell/NameFilter";
  const mod = await import(/* @vite-ignore */ path);
  return mod.NameFilter as ComponentType<NameFilterProps>;
}

let onApply: ReturnType<typeof vi.fn>;
let onLeavePending: ReturnType<typeof vi.fn>;

const input = () => screen.getByRole("searchbox", { name: "Filter by name" }) as HTMLInputElement;
const queryInput = () => screen.queryByRole("searchbox", { name: "Filter by name" });
const icon = () => screen.getByRole("button", { name: "Filter by name" });
const queryIcon = () => screen.queryByRole("button", { name: "Filter by name" });
const clear = () => screen.getByRole("button", { name: "Clear input" });
const queryClear = () => screen.queryByRole("button", { name: "Clear input" });

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const applied = () => onApply.mock.calls.map(([n]) => n);

async function mount(props: Partial<NameFilterProps> = {}) {
  const NameFilter = await part();
  const all = (p: Partial<NameFilterProps>): NameFilterProps => ({ value: "", onApply, ...p });
  const view = render(<NameFilter {...all(props)} />);
  return {
    ...view,
    NameFilter,
    update: (next: Partial<NameFilterProps>) => view.rerender(<NameFilter {...all({ ...props, ...next })} />),
  };
}

/** Mounts a closed field and opens it with the icon. */
async function mountOpen(props: Partial<NameFilterProps> = {}) {
  const view = await mount(props);
  fireEvent.click(icon());
  return view;
}

beforeEach(() => {
  onApply = vi.fn();
  onLeavePending = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SPEC-CORE-156 I11 what the part draws", () => {
  it("SPEC-CORE-156 I11 closed, it is an icon button named Filter by name and no input", async () => {
    await mount();

    expect(icon()).toBeInTheDocument();
    expect(icon().querySelector("svg")?.getAttribute("class")).toContain("lucide-search");
    expect(queryInput()).toBeNull();
  });

  it("SPEC-CORE-156 I11 open, the input is a search field named Filter by name with its placeholder and a 200 cap", async () => {
    await mountOpen();

    expect(input()).toHaveAttribute("type", "search");
    expect(input()).toHaveAttribute("placeholder", "Filter by name...");
    expect(input().maxLength).toBe(200);
  });

  it("SPEC-CORE-156 I11 the × button is named Clear input and is there only while the field holds text", async () => {
    await mountOpen();
    expect(queryClear()).toBeNull();

    type("k");
    expect(clear()).toBeInTheDocument();

    type("");
    expect(queryClear()).toBeNull();
  });

  it("SPEC-CORE-156 a field holding only spaces holds text: × is drawn", async () => {
    await mountOpen();

    type("   ");

    expect(clear()).toBeInTheDocument();
  });
});

describe("SPEC-CORE-156 I3 applying", () => {
  beforeEach(() => vi.useFakeTimers());

  it("SPEC-CORE-156 I3 typing applies 300ms after the last input, and only the last text", async () => {
    await mountOpen();

    type("k");
    advance(200);
    type("ky");
    advance(299);
    expect(onApply).not.toHaveBeenCalled();

    advance(1);
    expect(applied()).toEqual(["ky"]);
  });

  it("SPEC-CORE-156 I10 the applied name is the draft trimmed", async () => {
    await mountOpen();

    type("  京都  ");
    advance(300);

    expect(applied()).toEqual(["京都"]);
  });

  it("SPEC-CORE-156 I10 the applied name is cut to 200 characters", async () => {
    await mountOpen();

    type("x".repeat(250));
    advance(300);

    expect(applied()).toEqual(["x".repeat(200)]);
  });

  it("SPEC-CORE-156 I10 a draft of only spaces applies the empty name", async () => {
    await mount({ value: "old" });

    type("   ");
    advance(300);

    expect(applied()).toEqual([""]);
  });

  it("SPEC-CORE-156 I3 nothing is applied during IME composition, and the 300ms starts at compositionend", async () => {
    await mountOpen();

    fireEvent.compositionStart(input());
    type("き");
    advance(1000);
    type("きょうと");
    advance(1000);
    type("京都");
    advance(1000);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input(), { data: "京都" });
    advance(299);
    expect(onApply).not.toHaveBeenCalled();

    advance(1);
    expect(applied()).toEqual(["京都"]);
  });

  it("SPEC-CORE-156 I3 Enter applies at once and keeps focus", async () => {
    await mountOpen();

    type("kyoto");
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(applied()).toEqual(["kyoto"]);
    expect(document.activeElement).toBe(input());
  });

  it("SPEC-CORE-156 I7 × applies the empty name at once, cancels the pending apply and keeps focus in the field", async () => {
    await mount({ value: "old" });
    input().focus();

    type("older");
    fireEvent.click(clear());

    expect(applied()).toEqual([""]);
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());

    advance(1000);
    expect(applied()).toEqual([""]);
  });

  it("SPEC-CORE-156 I7 Escape with text does the same as ×", async () => {
    await mount({ value: "old" });
    input().focus();

    type("older");
    fireEvent.keyDown(input(), { key: "Escape" });

    expect(applied()).toEqual([""]);
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());

    advance(1000);
    expect(applied()).toEqual([""]);
  });

  it("SPEC-CORE-156 deleting every character is an ordinary edit, applied after 300ms, and the field stays open", async () => {
    await mount({ value: "ab" });
    input().focus();

    type("a");
    type("");
    advance(299);
    expect(onApply).not.toHaveBeenCalled();

    advance(1);
    expect(applied()).toEqual([""]);
    expect(queryInput()).not.toBeNull();
  });
});

describe("SPEC-CORE-156 I13 value from outside", () => {
  beforeEach(() => vi.useFakeTimers());

  it("SPEC-CORE-156 a value other than the last applied name becomes the draft and cancels the pending apply", async () => {
    const view = await mount({ value: "old" });

    type("typed");
    view.update({ value: "reset" });

    expect(input().value).toBe("reset");
    advance(1000);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-156 I13 the echo of the part's own apply leaves a trailing space in the draft", async () => {
    const view = await mountOpen();

    type("kyoto ");
    advance(300);
    expect(applied()).toEqual(["kyoto"]);

    view.update({ value: "kyoto" });

    expect(input().value).toBe("kyoto ");
  });

  it("SPEC-CORE-156 I13 text typed while the echo is landing survives it", async () => {
    const view = await mountOpen();

    type("kyo");
    advance(300);
    type("kyoto");
    view.update({ value: "kyo" });

    expect(input().value).toBe("kyoto");
    advance(300);
    expect(applied()).toEqual(["kyo", "kyoto"]);
  });

  it("SPEC-CORE-156 a value equal to the last applied name after an Enter apply leaves the draft alone", async () => {
    const view = await mountOpen();

    type("kyoto ");
    fireEvent.keyDown(input(), { key: "Enter" });
    view.update({ value: "kyoto" });

    expect(input().value).toBe("kyoto ");
  });
});

describe("SPEC-CORE-156 I7 opening and closing", () => {
  it("SPEC-CORE-156 the icon opens an empty field and focuses the input", async () => {
    await mountOpen();

    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    expect(queryIcon()).toBeNull();
  });

  it("SPEC-CORE-156 I7 blur with an empty draft closes the field back to the icon", async () => {
    await mountOpen();

    fireEvent.blur(input());

    expect(queryInput()).toBeNull();
    expect(icon()).toBeInTheDocument();
  });

  it("SPEC-CORE-156 I7 blur with text leaves the field open", async () => {
    await mountOpen();

    type("kyoto");
    fireEvent.blur(input());

    expect(input().value).toBe("kyoto");
  });

  it("SPEC-CORE-156 I7 blur with only spaces closes the field and empties its draft", async () => {
    await mountOpen();

    type("   ");
    fireEvent.blur(input());

    expect(queryInput()).toBeNull();
    fireEvent.click(icon());
    expect(input().value).toBe("");
  });

  it("SPEC-CORE-156 I7 Escape on an empty field closes it and focuses the icon", async () => {
    await mountOpen();

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(queryInput()).toBeNull();
    expect(document.activeElement).toBe(icon());
  });

  it("SPEC-CORE-156 I7 Escape with text clears it and leaves the field open", async () => {
    await mountOpen();

    type("kyoto");
    fireEvent.keyDown(input(), { key: "Escape" });

    expect(input().value).toBe("");
    expect(queryIcon()).toBeNull();
  });

  it("SPEC-CORE-156 a non-empty value draws the field open with it, without moving focus to it", async () => {
    await mount({ value: "京都" });

    expect(input().value).toBe("京都");
    expect(queryIcon()).toBeNull();
    expect(document.activeElement).not.toBe(input());
  });

  it("SPEC-CORE-156 an outside non-empty value opens a closed field without moving focus", async () => {
    const view = await mount();
    expect(queryInput()).toBeNull();

    view.update({ value: "京都" });

    expect(input().value).toBe("京都");
    expect(document.activeElement).not.toBe(input());
  });

  it("SPEC-CORE-156 a reset while the input has focus empties the draft and leaves the field open until blur", async () => {
    const view = await mount({ value: "kyoto" });
    input().focus();

    view.update({ value: "" });

    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());

    fireEvent.blur(input());
    expect(queryInput()).toBeNull();
    expect(icon()).toBeInTheDocument();
  });

  it("SPEC-CORE-156 an outside empty value closes the field when it does not have focus", async () => {
    const view = await mount({ value: "kyoto" });
    expect(document.activeElement).not.toBe(input());

    view.update({ value: "" });

    expect(queryInput()).toBeNull();
    expect(icon()).toBeInTheDocument();
  });
});

describe("SPEC-CORE-156 I7 alwaysOpen", () => {
  it("SPEC-CORE-156 I7 is never drawn as the icon, even empty", async () => {
    await mount({ alwaysOpen: true });

    expect(input().value).toBe("");
    expect(queryIcon()).toBeNull();
  });

  it("SPEC-CORE-156 I7 blur on an empty field changes nothing", async () => {
    await mount({ alwaysOpen: true });
    input().focus();

    fireEvent.blur(input());

    expect(queryInput()).not.toBeNull();
    expect(queryIcon()).toBeNull();
  });

  it("SPEC-CORE-156 I7 Escape on an empty field changes nothing", async () => {
    await mount({ alwaysOpen: true });
    input().focus();

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(queryInput()).not.toBeNull();
    expect(queryIcon()).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-156 I7 Escape with text still clears and applies the empty name at once", async () => {
    vi.useFakeTimers();
    await mount({ alwaysOpen: true, value: "kyoto" });

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(applied()).toEqual([""]);
    expect(queryInput()).not.toBeNull();
  });
});

describe("SPEC-CORE-156 I13 a pending apply on unmount and on a scope change", () => {
  beforeEach(() => vi.useFakeTimers());

  it("SPEC-CORE-156 I13 unmounting with a pending apply hands the trimmed draft to onLeavePending once, and applies nothing", async () => {
    const view = await mountOpen({ onLeavePending });

    type("  kyoto ");
    advance(100);
    view.unmount();
    advance(1000);

    expect(onLeavePending.mock.calls).toEqual([["kyoto"]]);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-156 I13 unmounting with nothing pending does not call onLeavePending", async () => {
    const view = await mountOpen({ onLeavePending });

    type("kyoto");
    advance(300);
    view.unmount();
    advance(1000);

    expect(onLeavePending).not.toHaveBeenCalled();
    expect(applied()).toEqual(["kyoto"]);
  });

  it("SPEC-CORE-156 I13 without onLeavePending the pending text is dropped on unmount", async () => {
    const view = await mountOpen();

    type("kyoto");
    view.unmount();
    advance(1000);

    expect(onApply).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-156 I13 a scopeKey change drops the pending apply", async () => {
    const view = await mount({ value: "", scopeKey: "all|", onLeavePending });
    fireEvent.click(icon());

    type("kyoto");
    advance(100);
    view.update({ scopeKey: "shelf|tag:trip" });
    advance(1000);

    expect(onApply).not.toHaveBeenCalled();

    view.unmount();
    expect(onLeavePending).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-156 I13 a scopeKey change that drops a pending apply shows the name in force", async () => {
    const view = await mount({ value: "web", scopeKey: "all|" });

    type("webzz");
    advance(100);
    view.update({ scopeKey: "shelf|tag:trip" });
    advance(1000);

    expect(onApply).not.toHaveBeenCalled();
    expect(input()).toHaveValue("web");
  });

  it("SPEC-CORE-156 I13 an unchanged scopeKey keeps the pending apply", async () => {
    const view = await mount({ value: "", scopeKey: "all|" });
    fireEvent.click(icon());

    type("kyoto");
    advance(100);
    view.update({ scopeKey: "all|" });
    advance(200);

    expect(applied()).toEqual(["kyoto"]);
  });
});
