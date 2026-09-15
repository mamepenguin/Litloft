import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/lib/api", () => ({
  getDriveFiles: () => Promise.resolve({ files: [], meta: { total: 0 } }),
  getWatchHistory: () => Promise.resolve([]),
}));

vi.mock("../PageHeader", () => ({ PageHeader: () => <div /> }));

vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: "viewer" }),
}));

function SectionStandIn({ title, icon }: { title?: string; icon?: ReactNode }) {
  return <section aria-label={title ?? "Continue Watching"}>{icon}</section>;
}

vi.mock("../ContinueWatchingSection", () => ({ ContinueWatchingSection: SectionStandIn }));
vi.mock("../CarouselSection", () => ({ CarouselSection: SectionStandIn }));

import { DriveHome } from "../DriveHome";

describe("DriveHome section icons", () => {
  it("draws Recently Viewed as a history mark and Recently Added as a new file", () => {
    render(<DriveHome driveName="main" />);
    const iconOf = (label: string) =>
      screen.getByRole("region", { name: label }).querySelector("svg")?.getAttribute("class");
    expect(iconOf("Recently Viewed")).toContain("lucide-history");
    expect(iconOf("Recently Added")).toContain("lucide-file-plus");
  });
});
