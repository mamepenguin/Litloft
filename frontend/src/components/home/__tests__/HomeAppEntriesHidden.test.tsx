/**
 * SPEC-CORE-106: `HomeAppEntries` with `hiddenKeys`. Section 3 (null is loading), I1, I2, I4, I5.
 */

import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HomeAppEntries } from "@/components/home/HomeAppEntries";
import type { AddonNavEntry } from "@/lib/addonNavigation";

const DRIVE = "main";
const DRIVE_BASE = "/drive/main";

const addonEntry = (key: string, label: string): AddonNavEntry => ({
  name: key,
  key,
  navigation: { label, placement: "primary", priority: 1 },
  href: `${DRIVE_BASE}/addons/${key}`,
});
const ADDONS = [addonEntry("knowledge", "Notes"), addonEntry("photo_diary", "Photo Diary")];

function renderRow(hiddenKeys: ReadonlySet<string> | null, inboxCount = 0) {
  render(
    <HomeAppEntries
      drive={DRIVE}
      addonEntries={ADDONS}
      inboxCount={inboxCount}
      shortcuts={[]}
      hiddenKeys={hiddenKeys}
    />,
  );
  return screen.getByRole("navigation", { name: "Apps" });
}

const hrefs = (nav: HTMLElement) =>
  within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));

describe("SPEC-CORE-106 HomeAppEntries hiddenKeys", () => {
  it("SPEC-CORE-106 Section 3 I1: null (loading) renders Library and no hideable entry", () => {
    const nav = renderRow(null);
    expect(within(nav).getByText("Library")).toBeInTheDocument();
    expect(within(nav).queryByText("Video")).toBeNull();
    expect(within(nav).queryByText("Reading")).toBeNull();
    expect(within(nav).queryByText("Notes")).toBeNull();
    expect(within(nav).queryByText("Photo Diary")).toBeNull();
  });

  it("SPEC-CORE-106 I2: a set removes exactly the matching keys and keeps the rest in order", () => {
    const full = hrefs(renderRow(new Set()));
    cleanup();

    const nav = renderRow(new Set(["reading", "knowledge"]));
    expect(hrefs(nav)).toEqual(
      full.filter((href) => href !== `${DRIVE_BASE}/apps/reading` && href !== `${DRIVE_BASE}/addons/knowledge`),
    );
  });

  it("SPEC-CORE-106 I4: library and inbox stay when listed, and the unknown key changes nothing", () => {
    const nav = renderRow(new Set(["library", "inbox", "nope", "reading"]), 2);
    expect(within(nav).getByText("Library")).toBeInTheDocument();
    expect(within(nav).getByText("Inbox")).toBeInTheDocument();
    expect(within(nav).getByText("Video")).toBeInTheDocument();
    expect(within(nav).getByText("Notes")).toBeInTheDocument();
    expect(within(nav).queryByText("Reading")).toBeNull();
  });
});
