/**
 * SPEC-CORE-030 I13 — the drawer itself, not a fixture: where it sits for each
 * state of the mini-player and the inspector sheet, and whether it is drawn.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadProgress } from "@/components/UploadProgress";
import {
  MINI_PLAYER_GAP_PX,
  MINI_PLAYER_HEIGHT_PX,
  setInspectorSheetState,
  setMiniPlayerShown,
  type InspectorSheetState,
} from "@/lib/bottomChrome";
import { SHEET_PEEK_PX } from "@/lib/sheetSnap";

vi.mock("@/hooks/useUpload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useUpload")>();
  return {
    ...actual,
    useUpload: () => ({
      uploads: [
        { id: "u1", filename: "a.jpg", relativePath: "", progress: 10, status: "uploading" },
      ],
      cancelUpload: vi.fn(),
      clearCompleted: vi.fn(),
    }),
  };
});

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function drawerBottom(container: HTMLElement): string | null {
  const root = container.firstElementChild as HTMLElement | null;
  return root ? root.style.bottom : null;
}

function arrange(miniPlayer: boolean, sheet: InspectorSheetState) {
  act(() => {
    setMiniPlayerShown(miniPlayer);
    setInspectorSheetState(sheet);
  });
}

afterEach(() => arrange(false, "none"));

describe("SPEC-CORE-030 I13 the drawer's place", () => {
  it.each([
    ["nothing below it", false, "none", []],
    ["the mini-player", true, "none", [`${MINI_PLAYER_HEIGHT_PX + MINI_PLAYER_GAP_PX}px`]],
    ["the inspector bar", false, "peek", [`${SHEET_PEEK_PX}px`]],
    [
      "both",
      true,
      "peek",
      [`${MINI_PLAYER_HEIGHT_PX + MINI_PLAYER_GAP_PX}px`, `${SHEET_PEEK_PX}px`, "max("],
    ],
  ] as const)("sits above %s", (_name, mini, sheet, parts) => {
    arrange(mini, sheet);
    const { container } = render(<UploadProgress />);

    const bottom = drawerBottom(container);
    expect(bottom).not.toBeNull();
    if (parts.length === 0) expect(bottom).toBe("");
    for (const part of parts) expect(bottom).toContain(part);
  });

  it.each(["half", "full"] as const)("is not drawn while the sheet is open at %s", (sheet) => {
    arrange(false, sheet);
    const { container } = render(<UploadProgress />);
    expect(container.firstElementChild).toBeNull();
  });

  it("uses the mini-player's own height and gap", () => {
    const source = readFileSync(resolve(SRC_ROOT, "components/MiniPlayerContainer.tsx"), "utf8");
    expect(source).toContain(`h-[${MINI_PLAYER_HEIGHT_PX}px]`);
    expect(source).toMatch(new RegExp(`\\+ ${MINI_PLAYER_GAP_PX}px\\)`));
  });
});
