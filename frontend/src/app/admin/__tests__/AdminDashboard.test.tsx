import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { accentFills } from "@/__tests__/helpers/accentFills";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key}:${Object.values(values).join(",")}` : `${namespace}.${key}`;
    return t;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin",
}));

// The slots draw addon content this test has no business rendering, and
// `accent-budget.test.tsx` stubs them for the same reason: a screen's own
// budget is what it spends, not what an installed addon spends inside it.
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: () => null,
}));
vi.mock("@/components/DuplicatesSection", () => ({
  DuplicatesSection: () => null,
}));
vi.mock("@/hooks/useWebSocket", () => ({ useWebSocket: () => null }));

const mockGetDashboard = vi.fn();
vi.mock("@/lib/api", () => ({
  getDashboard: (...args: unknown[]) => mockGetDashboard(...args),
}));

import AdminDashboardPage from "@/app/admin/page";

function drive(name: string, fileTypes: Record<string, number>) {
  return {
    name,
    file_count: Object.values(fileTypes).reduce((a, b) => a + b, 0),
    file_types: fileTypes,
    readonly: false,
    is_scanning: false,
    last_scanned_at: null,
  };
}

const system = {
  total_files: 1,
  trash_count: 0,
  db_size_bytes: 1,
  thumbnail_cache_bytes: 1,
  converted_cache_bytes: 1,
  upload_temp_bytes: 1,
  uptime_seconds: 60,
  filesystems: [],
};

beforeEach(() => {
  mockGetDashboard.mockReset();
});

afterEach(cleanup);

describe("/admin dashboard", () => {
  async function renderDashboard(drives: ReturnType<typeof drive>[]) {
    mockGetDashboard.mockResolvedValue({ drives, system });
    const view = render(<AdminDashboardPage />);
    // The rendered result, not the call that starts it. `getDashboard` is
    // invoked synchronously inside `render`'s act, so waiting for the mock
    // returns while the skeletons may still be on screen — and a skeleton
    // has no accent fill and no alerts wrapper either, so two of the
    // assertions below would pass over nothing.
    await screen.findAllByRole("heading", { level: 3 });
    return view;
  }

  it("draws the same six labels in the same order on every card", async () => {
    const { container } = await renderDashboard([
      drive("Media", { video: 500, audio: 50 }),
      drive("Docs", { document: 60, archive: 12 }),
    ]);

    const cards = await screen.findAllByRole("heading", { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(["Media", "Docs", "admin.system"]);

    // Read off the rendered text of each drive card's breakdown line, so
    // the comparison is the one the reader makes: same words, same order.
    const lines = Array.from(
      container.querySelectorAll("p.text-xs.text-text-muted"),
    ).map((p) => p.textContent ?? "");
    const breakdowns = lines.filter((l) => l.includes("filter.type.video"));
    expect(breakdowns).toHaveLength(2);
    const labelsOf = (line: string) =>
      line.split(" · ").map((part) => part.replace(/\s[\d,]+$/, ""));
    expect(labelsOf(breakdowns[0]!)).toHaveLength(6);
    expect(labelsOf(breakdowns[0]!)).toEqual(labelsOf(breakdowns[1]!));
    expect(breakdowns[0]).toContain("filter.type.video 500");
    expect(breakdowns[0]).toContain("filter.type.image 0");
  });

  /**
   * A regression check, not a repair: `/admin` spent no accent fill
   * before this either. It is here because the dashboard is where an
   * addon widget and three card headings meet, and 裁定 R2 puts every
   * core screen under the budget rather than only the ones that failed it.
   */
  it("spends no accent fill", async () => {
    const { container } = await renderDashboard([
      drive("Media", { video: 500 }),
    ]);
    expect(accentFills(container)).toEqual([]);
  });

  it("keeps the alerts slot above everything that is fine", async () => {
    // ADM-2 put "anything wrong" between the header and the drive cards.
    // The slot is stubbed to null here, so what is asserted is the
    // wrapper's position in the document, which is what carries the rule.
    const { container } = await renderDashboard([drive("Media", { video: 1 })]);
    const alerts = container.querySelector(".empty\\:hidden");
    const drivesSection = container.querySelector("section");
    const header = container.querySelector("header");
    expect(alerts).not.toBeNull();
    // Both bounds. With only the lower one, moving the band above the
    // page's own title left this green — and "anything wrong, above
    // everything that is fine" is a claim about a position inside the
    // page, not above its heading.
    expect(
      header!.compareDocumentPosition(alerts!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      alerts!.compareDocumentPosition(drivesSection!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("heads the page through PageHeader, and only once", async () => {
    await renderDashboard([drive("Media", { video: 1 })]);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe("admin.title");
    expect(
      within(h1s[0]!.closest("header")!).getByRole("link", {
        name: "admin.settings",
      }),
    ).toBeTruthy();
  });
});
