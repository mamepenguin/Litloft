import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageFrame, type PageFrameWidth } from "../PageFrame";
import { PageHeader } from "../PageHeader";

function frameOf(el: HTMLElement): HTMLElement {
  const frame = el.closest<HTMLElement>("[data-page-frame]");
  if (!frame) throw new Error("not inside a PageFrame");
  return frame;
}

describe("PageFrame", () => {
  it.each<[PageFrameWidth, string | null]>([
    ["full", null],
    ["wide", "max-w-wide"],
    ["list", "max-w-list-row"],
    ["reading", "max-w-reading"],
  ])("caps the %s column at %s", (width, maxClass) => {
    render(
      <PageFrame width={width} header={<PageHeader title="T" />}>
        <p>body</p>
      </PageFrame>,
    );
    const frame = frameOf(screen.getByRole("heading", { level: 1 }));
    expect(frame.dataset.pageFrame).toBe(width);
    const maxClasses = [...frame.classList].filter((c) => c.startsWith("max-w-"));
    expect(maxClasses).toEqual(maxClass ? [maxClass] : []);
    expect(frame.classList.contains("mx-auto")).toBe(maxClass !== null);
  });

  it("puts header and body in one column, header first", () => {
    render(
      <PageFrame width="list" header={<PageHeader title="T" />}>
        <p>body</p>
      </PageFrame>,
    );
    const frame = frameOf(screen.getByRole("heading", { level: 1 }));
    const body = screen.getByText("body");
    expect(frameOf(body)).toBe(frame);
    expect([...frame.children].map((c) => c.tagName)).toEqual(["HEADER", "P"]);
  });

  // The title's Y is the header's own `py-2`; padding here would move it on
  // every screen that wears the frame and not on the file-detail chrome.
  it("adds no vertical padding above the header", () => {
    render(
      <PageFrame width="wide" header={<PageHeader title="T" />} className="flex-1">
        <p>body</p>
      </PageFrame>,
    );
    const frame = frameOf(screen.getByRole("heading", { level: 1 }));
    expect([...frame.classList].filter((c) => /^(sm:|md:)?(p|py|pt)-/.test(c))).toEqual([]);
    expect(frame.classList.contains("flex-1")).toBe(true);
  });
});
