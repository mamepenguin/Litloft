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

describe("SPEC-CORE-093 page jump with several entrances", () => {
  it("SPEC-CORE-093 I10 offers one destination per entrance, Clips with lucide Newspaper", () => {
    catalogue = {
      notesaddon: {
        label: "Notes",
        icon: "package",
        href: "/drive/{drive}/addons/x",
        scope: "drive",
        navigation: [
          { label: "Notes", placement: "primary", priority: 20, icon: "notebook-pen" },
          { label: "Clips", placement: "primary", priority: 21, icon: "newspaper", path: "clips" },
        ] as unknown as AddonMeta["navigation"],
      },
    };
    const { result } = renderHook(() => useJumpDestinations(false, "main"));
    const hrefs = result.current.map((d) => d.href);
    const notes = hrefs.indexOf("/drive/main/addons/notesaddon");
    const clips = hrefs.indexOf("/drive/main/addons/notesaddon/clips");
    expect(notes).toBeGreaterThanOrEqual(0);
    expect(clips).toBe(notes + 1);

    const { container } = render(createElement(result.current[clips].icon));
    expect(container.querySelector("svg")?.getAttribute("class")?.split(/\s+/)).toContain("lucide-newspaper");
  });
});
