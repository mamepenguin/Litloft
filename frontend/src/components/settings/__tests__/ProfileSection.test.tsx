import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileSection } from "../ProfileSection";

const profileState: { nickname: string | null } = { nickname: null };
const setNicknameMock = vi.fn();
const clearNicknameMock = vi.fn();

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({
    nickname: profileState.nickname,
    setNickname: setNicknameMock,
    clearNickname: clearNicknameMock,
  }),
}));

beforeEach(() => {
  setNicknameMock.mockClear();
  clearNicknameMock.mockClear();
  profileState.nickname = null;
});

describe("ProfileSection", () => {
  describe("when nickname is unset", () => {
    it("renders an input field and a save button", () => {
      render(<ProfileSection />);
      expect(
        screen.getByPlaceholderText("名前を入力"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    });

    it("calls setNickname with input value when save is clicked", () => {
      render(<ProfileSection />);
      const input = screen.getByPlaceholderText("名前を入力") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Alice" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      expect(setNicknameMock).toHaveBeenCalledWith("Alice");
    });

    it("does NOT render a clear button", () => {
      render(<ProfileSection />);
      expect(
        screen.queryByRole("button", { name: "プロファイルをクリア" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("when nickname is set", () => {
    beforeEach(() => {
      profileState.nickname = "Bob";
    });

    it("displays the current nickname", () => {
      render(<ProfileSection />);
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("renders switch and clear buttons", () => {
      render(<ProfileSection />);
      expect(
        screen.getByRole("button", { name: "別の名前に切り替え" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "プロファイルをクリア" }),
      ).toBeInTheDocument();
    });

    it("shows a cancel button when editing and exits edit mode without saving", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "別の名前に切り替え" }));
      const cancel = screen.getByRole("button", { name: "キャンセル" });
      expect(cancel).toBeInTheDocument();
      fireEvent.click(cancel);
      // Returned to display mode: nickname visible, switch button back, no input
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "別の名前に切り替え" }),
      ).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("名前を入力")).not.toBeInTheDocument();
      expect(setNicknameMock).not.toHaveBeenCalled();
    });

    it("opens a switch confirmation dialog before applying a different name", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "別の名前に切り替え" }));
      const input = screen.getByPlaceholderText("名前を入力") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Carol" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      // Dialog should be open; setNickname not yet called
      expect(setNicknameMock).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          /プロファイルを「Bob」から「Carol」に切り替えます/,
        ),
      ).toBeInTheDocument();
      // Confirm
      fireEvent.click(screen.getByRole("button", { name: "切り替える" }));
      expect(setNicknameMock).toHaveBeenCalledWith("Carol");
    });

    it("does not open the switch dialog when input matches the current name", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "別の名前に切り替え" }));
      // Input is prefilled with current nickname (Bob)
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      // No confirmation needed; saves directly
      expect(setNicknameMock).toHaveBeenCalledWith("Bob");
      expect(
        screen.queryByText(/プロファイルを「Bob」から/),
      ).not.toBeInTheDocument();
    });

    it("opens confirm dialog and calls clearNickname on confirm", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "プロファイルをクリア" }));
      // ConfirmDialog should now be visible — it has the message text
      expect(
        screen.getByText(
          "プロファイルをクリアすると視聴履歴がこのデバイスから切り離されます。よろしいですか？",
        ),
      ).toBeInTheDocument();
      // Click the confirm button (label = "プロファイルをクリア" in the dialog)
      const confirmButtons = screen.getAllByRole("button", {
        name: "プロファイルをクリア",
      });
      // The dialog confirm is the last one rendered
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);
      expect(clearNicknameMock).toHaveBeenCalledTimes(1);
    });

    it("does NOT call clearNickname when dialog is cancelled", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "プロファイルをクリア" }));
      fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
      expect(clearNicknameMock).not.toHaveBeenCalled();
    });
  });
});
