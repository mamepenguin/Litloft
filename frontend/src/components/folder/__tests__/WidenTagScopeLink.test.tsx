/**
 * spec 2026-08-21-folder-scoped-tag-filter §8
 *
 * With folder scope as the default, the drive-wide view needs a door.
 * One component serves both places it is offered — the toolbar header and
 * the empty state — so the two cannot drift apart in wording or target.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { WidenTagScopeLink, buildWidenTagScope } from "../WidenTagScopeLink";

describe("buildWidenTagScope", () => {
  it("targets the drive root with the tag preserved", () => {
    expect(buildWidenTagScope("main", "soup")).toEqual({
      tagName: "soup",
      href: "/drive/main?tag=soup",
    });
  });

  it("encodes drive and tag names containing non-ASCII characters or symbols", () => {
    const scope = buildWidenTagScope("写真 & 動画", "50% off");
    expect(scope?.href).toBe(
      `/drive/${encodeURIComponent("写真 & 動画")}?tag=${encodeURIComponent("50% off")}`,
    );
  });

  it("returns null when there is no folder-scoped tag filter to widen", () => {
    expect(buildWidenTagScope("main", null)).toBeNull();
    expect(buildWidenTagScope("main", "")).toBeNull();
  });
});

describe("WidenTagScopeLink", () => {
  it("renders a real link to the drive-wide view", () => {
    render(<WidenTagScopeLink scope={buildWidenTagScope("main", "soup")!} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/drive/main?tag=soup");
  });

  it("uses no emoji in its label", () => {
    render(<WidenTagScopeLink scope={buildWidenTagScope("main", "soup")!} />);
    const text = screen.getByRole("link").textContent ?? "";
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toMatch(/^[\p{L}\p{N}\p{P}\p{Zs}]*$/u);
  });
});
