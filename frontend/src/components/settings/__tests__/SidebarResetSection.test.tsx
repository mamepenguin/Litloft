/**
 * Phase 4: /settings の「サイドバーの並び順をリセット」結合テスト
 *
 * spec 2026-05-18-sidebar-reorder §5.3 / hako c3CcYY_a8nRwD5lG-zeOi。
 * - sidebar:order:* と sidebar:sort:* のみ削除
 * - sidebar:section:*:collapsed（別機能 = 折りたたみ状態）は温存
 * - ConfirmDialog 確認後にのみ削除、キャンセルでは何も消えない
 *
 * 実 ConfirmDialog を描画する流儀は ProfileSection.test.tsx に倣う
 * (next-intl は src/test/setup.ts でグローバル mock、en 文言が解決される)。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SidebarResetSection } from "../SidebarResetSection";

const ORDER_KEYS = {
  "sidebar:order:sections": JSON.stringify(["tags", "pins"]),
  "sidebar:order:pins:main": JSON.stringify(["b", "a"]),
  "sidebar:sort:tags:main": "name",
};
const PRESERVED_KEY = "sidebar:section:tags:collapsed";

function seed() {
  window.localStorage.clear();
  for (const [k, v] of Object.entries(ORDER_KEYS)) {
    window.localStorage.setItem(k, v);
  }
  window.localStorage.setItem(PRESERVED_KEY, "1");
  // an unrelated key must also survive
  window.localStorage.setItem("NEXT_LOCALE", "en");
}

function openDialogAndConfirm() {
  // Trigger button and the dialog confirm button share the label
  // "Reset order"; the dialog one is rendered last in the DOM.
  fireEvent.click(screen.getAllByRole("button", { name: "Reset order" })[0]);
  const buttons = screen.getAllByRole("button", { name: "Reset order" });
  fireEvent.click(buttons[buttons.length - 1]);
}

describe("SidebarResetSection", () => {
  beforeEach(() => {
    seed();
  });

  it("(1) removes sidebar:order:* and sidebar:sort:* after confirming", () => {
    render(<SidebarResetSection />);
    openDialogAndConfirm();

    expect(window.localStorage.getItem("sidebar:order:sections")).toBeNull();
    expect(window.localStorage.getItem("sidebar:order:pins:main")).toBeNull();
    expect(window.localStorage.getItem("sidebar:sort:tags:main")).toBeNull();
  });

  it("(2) preserves sidebar:section:*:collapsed and unrelated keys", () => {
    render(<SidebarResetSection />);
    openDialogAndConfirm();

    expect(window.localStorage.getItem(PRESERVED_KEY)).toBe("1");
    expect(window.localStorage.getItem("NEXT_LOCALE")).toBe("en");
  });

  it("(3) cancelling removes nothing", () => {
    render(<SidebarResetSection />);
    fireEvent.click(screen.getByRole("button", { name: "Reset order" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(window.localStorage.getItem("sidebar:order:sections")).toBe(
      ORDER_KEYS["sidebar:order:sections"],
    );
    expect(window.localStorage.getItem("sidebar:sort:tags:main")).toBe("name");
  });

  it("(4) shows a done status only after confirming", () => {
    render(<SidebarResetSection />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    openDialogAndConfirm();
    expect(screen.getByRole("status")).toHaveTextContent("Reset done");
  });
});
