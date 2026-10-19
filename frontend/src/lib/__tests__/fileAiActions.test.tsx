import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { BookOpen, Captions, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  resetFileAiActions,
  useFileAiActions,
  useOfferFileAiAction,
} from "../fileAiActions";

interface OfferProps {
  fileId: string;
  id: string;
  label?: string;
  icon?: LucideIcon;
  order: number;
  active?: boolean;
  busy?: boolean;
  run?: () => void;
}

function offer(initial: OfferProps) {
  return renderHook(
    (props: OfferProps) =>
      useOfferFileAiAction({
        label: props.id,
        icon: Sparkles,
        active: true,
        run: () => {},
        ...props,
      }),
    { initialProps: initial },
  );
}

function ids(fileId: string) {
  const { result } = renderHook(() => useFileAiActions(fileId));
  return () => result.current.map((action) => action.id);
}

afterEach(() => {
  act(() => resetFileAiActions());
});

describe("fileAiActions", () => {
  it("lists offers by ascending order, then by id", () => {
    offer({ fileId: "f1", id: "b.late", order: 100 });
    offer({ fileId: "f1", id: "z.first", order: 10 });
    offer({ fileId: "f1", id: "a.late", order: 100 });
    const read = ids("f1");
    expect(read()).toEqual(["z.first", "a.late", "b.late"]);
  });

  it("keeps each file's offers to that file", () => {
    offer({ fileId: "f1", id: "one", order: 10 });
    offer({ fileId: "f2", id: "two", order: 10 });
    expect(ids("f1")()).toEqual(["one"]);
    expect(ids("f2")()).toEqual(["two"]);
    expect(ids("f3")()).toEqual([]);
  });

  it.each(["first", "second"] as const)(
    "keeps an offer listed when the %s of two mounts unmounts",
    (which) => {
      const first = offer({ fileId: "f1", id: "same", order: 10 });
      const second = offer({ fileId: "f1", id: "same", order: 10 });
      const read = ids("f1");
      expect(read()).toEqual(["same"]);
      (which === "first" ? first : second).unmount();
      expect(read()).toEqual(["same"]);
    },
  );

  it("moves an offer to the file its offerer is re-rendered with", () => {
    const mounted = offer({ fileId: "f1", id: "one", order: 10 });
    const readF1 = ids("f1");
    const readF2 = ids("f2");
    mounted.rerender({ fileId: "f2", id: "one", order: 10 });
    expect(readF1()).toEqual([]);
    expect(readF2()).toEqual(["one"]);
  });

  it("reads the file its reader is re-rendered with", () => {
    offer({ fileId: "f1", id: "one", order: 10 });
    offer({ fileId: "f2", id: "two", order: 10 });
    const { result, rerender } = renderHook(
      ({ fileId }: { fileId: string }) => useFileAiActions(fileId),
      { initialProps: { fileId: "f1" } },
    );
    rerender({ fileId: "f2" });
    expect(result.current.map((action) => action.id)).toEqual(["two"]);
  });

  it("withdraws an offer when it stops being active", () => {
    const mounted = offer({ fileId: "f1", id: "one", order: 10 });
    const read = ids("f1");
    expect(read()).toEqual(["one"]);
    mounted.rerender({ fileId: "f1", id: "one", order: 10, active: false });
    expect(read()).toEqual([]);
  });

  it.each([
    ["label", { label: "Transcribe" }],
    ["icon", { icon: Captions }],
    ["busy", { busy: true }],
  ] as const)("republishes when the offer's %s changes", (_name, change) => {
    const base = {
      fileId: "f1",
      id: "one",
      label: "Summarise",
      icon: BookOpen,
      order: 10,
    };
    const mounted = offer(base);
    const { result } = renderHook(() => useFileAiActions("f1"));
    expect(result.current[0]).toMatchObject({
      label: "Summarise",
      icon: BookOpen,
      busy: false,
    });
    mounted.rerender({ ...base, ...change });
    expect(result.current[0]).toMatchObject(change);
  });

  it("runs the offerer's latest callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const mounted = offer({ fileId: "f1", id: "one", order: 10, run: first });
    mounted.rerender({ fileId: "f1", id: "one", order: 10, run: second });
    const { result } = renderHook(() => useFileAiActions("f1"));
    act(() => result.current[0].run());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("returns the same list between changes", () => {
    offer({ fileId: "f1", id: "one", order: 10 });
    const { result, rerender } = renderHook(() => useFileAiActions("f1"));
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});
