import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AppShell } from "../AppShell";
import { useQuickNote } from "../quick-note";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("../CurrentDriveProvider", () => ({
  useCurrentDrive: () => null,
}));

vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null }),
}));

vi.mock("../Sidebar", () => ({ Sidebar: () => null }));
vi.mock("../GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));

vi.mock("@/lib/api", () => ({
  getDrives: vi.fn().mockResolvedValue([]),
  createTextFile: vi.fn(),
}));

function PageButton() {
  const quickNote = useQuickNote();
  return (
    <button type="button" onClick={() => quickNote.open({ drive: "photos" })}>
      page-new-note
    </button>
  );
}

describe("AppShell Quick Note", () => {
  it("lets page content open the header's panel", async () => {
    render(
      <AppShell>
        <PageButton />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "page-new-note" }));
    expect(await screen.findByRole("dialog", { name: "Quick note" })).toBeInTheDocument();
  });
});
