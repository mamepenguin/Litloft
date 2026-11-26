/**
 * SPEC-CORE-181 I2 / I3 — the shared phone menu scrim and the player settings
 * sheet's scrim fade in, and a scrim that stays open is never replaced.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DismissScrim, MENU_SCRIM } from "@/components/DismissScrim";
import { SettingsSheet } from "@/components/player/MediaControls/SettingsSheet";
import { openScrim } from "@/__tests__/helpers/dismissScrim";

const animateClasses = (classList: string) =>
  classList
    .split(/\s+/)
    .filter((name) => name.startsWith("animate-") && name !== "animate-spin");

function Popup(): React.ReactElement {
  return (
    <div role="menu">
      <button type="button">row</button>
    </div>
  );
}

describe("SPEC-CORE-181 the phone menu scrim", () => {
  it("SPEC-CORE-181 I2 MENU_SCRIM fades in and carries no other animation", () => {
    expect(animateClasses(MENU_SCRIM)).toEqual(["animate-backdrop-in"]);
  });

  it("SPEC-CORE-181 I2 a DismissScrim without its own class draws the fading scrim, not around the popup", () => {
    render(
      <DismissScrim onDismiss={vi.fn()}>
        <Popup />
      </DismissScrim>,
    );
    const scrim = openScrim();
    expect(animateClasses(scrim.className)).toEqual(["animate-backdrop-in"]);
    expect(scrim.contains(screen.getByRole("menu"))).toBe(false);
  });

  it("SPEC-CORE-181 I3 keeps the same fading scrim node while `disabled` toggles", () => {
    const view = render(
      <DismissScrim onDismiss={vi.fn()} disabled={false}>
        <Popup />
      </DismissScrim>,
    );
    const scrim = openScrim();
    expect(animateClasses(scrim.className)).toEqual(["animate-backdrop-in"]);

    view.rerender(
      <DismissScrim onDismiss={vi.fn()} disabled>
        <Popup />
      </DismissScrim>,
    );
    expect(scrim.isConnected).toBe(true);

    view.rerender(
      <DismissScrim onDismiss={vi.fn()} disabled={false}>
        <Popup />
      </DismissScrim>,
    );
    expect(scrim.isConnected).toBe(true);
    expect(openScrim()).toBe(scrim);
  });
});

describe("SPEC-CORE-181 the player settings sheet's scrim", () => {
  function renderSheet(placement: "sheet" | "popover" = "sheet") {
    return render(
      <SettingsSheet
        placement={placement}
        playbackRate={1}
        onSelectRate={vi.fn()}
        captions="off"
        onToggleCaptions={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("SPEC-CORE-181 I2 fades in a /40 dim behind the sheet, and the sheet does not fade with it", () => {
    renderSheet();
    const scrim = screen.getByTestId("settings-sheet-backdrop");
    expect(animateClasses(scrim.className)).toEqual(["animate-backdrop-in"]);
    expect(scrim.classList.contains("bg-black/40")).toBe(true);
    expect(scrim.contains(screen.getByTestId("settings-sheet"))).toBe(false);
  });

  it("SPEC-CORE-181 I2 draws no dim and no animation behind the popover form", () => {
    renderSheet("popover");
    const scrim = screen.getByTestId("settings-sheet-backdrop");
    expect(animateClasses(scrim.className)).toEqual([]);
    expect(scrim.className.split(/\s+/).filter((name) => name.startsWith("bg-"))).toEqual([]);
  });
});
