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

    it("renders edit and clear buttons", () => {
      render(<ProfileSection />);
      expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "プロファイルをクリア" }),
      ).toBeInTheDocument();
    });

    it("shows a cancel button when editing and exits edit mode without saving", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "編集" }));
      const cancel = screen.getByRole("button", { name: "キャンセル" });
      expect(cancel).toBeInTheDocument();
      fireEvent.click(cancel);
      // Returned to display mode: nickname visible, edit button back, no input
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("名前を入力")).not.toBeInTheDocument();
      expect(setNicknameMock).not.toHaveBeenCalled();
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
