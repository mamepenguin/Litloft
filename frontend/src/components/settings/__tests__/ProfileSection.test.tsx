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
        screen.getByPlaceholderText("Enter your name"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("calls setNickname with input value when save is clicked", () => {
      render(<ProfileSection />);
      const input = screen.getByPlaceholderText("Enter your name") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Alice" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(setNicknameMock).toHaveBeenCalledWith("Alice");
    });

    it("does NOT render a clear button", () => {
      render(<ProfileSection />);
      expect(
        screen.queryByRole("button", { name: "Clear profile" }),
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
        screen.getByRole("button", { name: "Switch to a different name" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Clear profile" }),
      ).toBeInTheDocument();
    });

    it("shows a cancel button when editing and exits edit mode without saving", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "Switch to a different name" }));
      const cancel = screen.getByRole("button", { name: "Cancel" });
      expect(cancel).toBeInTheDocument();
      fireEvent.click(cancel);
      // Returned to display mode: nickname visible, switch button back, no input
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Switch to a different name" }),
      ).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Enter your name")).not.toBeInTheDocument();
      expect(setNicknameMock).not.toHaveBeenCalled();
    });

    it("opens a switch confirmation dialog before applying a different name", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "Switch to a different name" }));
      const input = screen.getByPlaceholderText("Enter your name") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Carol" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      // Dialog should be open; setNickname not yet called
      expect(setNicknameMock).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          /Switch profile from "Bob" to "Carol"/,
        ),
      ).toBeInTheDocument();
      // Confirm
      fireEvent.click(screen.getByRole("button", { name: "Switch" }));
      expect(setNicknameMock).toHaveBeenCalledWith("Carol");
    });

    it("does not open the switch dialog when input matches the current name", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "Switch to a different name" }));
      // Input is prefilled with current nickname (Bob)
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      // No confirmation needed; saves directly
      expect(setNicknameMock).toHaveBeenCalledWith("Bob");
      expect(
        screen.queryByText(/Switch profile from "Bob"/),
      ).not.toBeInTheDocument();
    });

    it("opens confirm dialog and calls clearNickname on confirm", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "Clear profile" }));
      // ConfirmDialog should now be visible — it has the message text
      expect(
        screen.getByText(
          "Clearing your profile will disconnect watch history from this device. Are you sure?",
        ),
      ).toBeInTheDocument();
      // Click the confirm button (label = "Clear profile" in the dialog)
      const confirmButtons = screen.getAllByRole("button", {
        name: "Clear profile",
      });
      // The dialog confirm is the last one rendered
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);
      expect(clearNicknameMock).toHaveBeenCalledTimes(1);
    });

    it("does NOT call clearNickname when dialog is cancelled", () => {
      render(<ProfileSection />);
      fireEvent.click(screen.getByRole("button", { name: "Clear profile" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(clearNicknameMock).not.toHaveBeenCalled();
    });
  });
});
