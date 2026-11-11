/** SPEC-CORE-073 I9: page jump draws an addon destination with the shared icon table. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { createElement } from "react";

import type { AddonMeta } from "@/lib/addons";

let catalogue: Record<string, AddonMeta> = {};
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({ addons: catalogue, catalogueDrive: "main", slots: {}, loading: false }),
}));

import { useJumpDestinations } from "../useJumpDestinations";

beforeEach(() => {
  catalogue = {};
});

describe("SPEC-CORE-073 I9 the addon icon in page jump", () => {
  it("SPEC-CORE-073 I9 draws a destination declaring images with lucide Images", () => {
    catalogue = {
      diary: {
        label: "Diary",
        icon: "package",
        href: "/drive/{drive}/addons/x",
        scope: "drive",
        navigation: { label: "Diary", placement: "primary", priority: 1, icon: "images" },
      },
    };
    const { result } = renderHook(() => useJumpDestinations(false, "main"));
    const dest = result.current.find((d) => d.href === "/drive/main/addons/diary");
    expect(dest).toBeDefined();

    const { container } = render(createElement(dest!.icon));
    expect(container.querySelector("svg")?.getAttribute("class")?.split(/\s+/)).toContain("lucide-images");
  });
});
