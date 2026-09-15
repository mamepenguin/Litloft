import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("../quick-note", () => ({ QuickNote: () => null }));
vi.mock("../CurrentDriveProvider", () => ({ useCurrentDrive: () => "work" }));
vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));
vi.mock("../TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle" />,
}));
vi.mock("../DriveTreeToggle", () => ({
  DriveTreeToggle: () => <button data-testid="tree-toggle" />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/work",
  useSearchParams: () => new URLSearchParams(),
}));

import { Header } from "../Header";

describe("the app header", () => {
  it("leaves the tree toggle to the fixed row beside the menu button", () => {
    render(<Header />);
    expect(screen.queryByTestId("tree-toggle")).toBeNull();
  });
});
