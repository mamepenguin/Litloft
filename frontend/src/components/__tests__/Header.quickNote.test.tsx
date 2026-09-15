/**
 * Quick Note is mounted directly rather than through the drive-scoped
 * `header-actions` slot so it also appears on screens with no active drive.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { Header } from "../Header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const driveState = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => driveState.current,
}));

vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null }),
}));

vi.mock("../GlobalSearch", () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}));

vi.mock("../AddonSlot", () => ({
  AddonSlot: () => <div data-testid="addon-slot" />,
}));

vi.mock("@/lib/api", () => ({
  getDrives: vi.fn().mockResolvedValue([]),
  createTextFile: vi.fn(),
}));

beforeEach(() => {
  driveState.current = null;
});

describe("Header quick note action", () => {
  it("renders on a screen with no active drive", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: "Quick note" })).toBeInTheDocument();
    expect(screen.queryByTestId("addon-slot")).not.toBeInTheDocument();
  });

  it("renders on a drive screen alongside the addon header actions", () => {
    driveState.current = "photos";
    render(<Header />);
    expect(screen.getByRole("button", { name: "Quick note" })).toBeInTheDocument();
    expect(screen.getByTestId("addon-slot")).toBeInTheDocument();
  });
});
