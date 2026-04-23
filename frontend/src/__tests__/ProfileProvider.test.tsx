import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ProfileProvider, useProfile } from "../components/ProfileProvider";

function TestConsumer() {
  const { nickname, setNickname, clearNickname } = useProfile();
  return (
    <div>
      <span data-testid="nickname">{nickname ?? "none"}</span>
      <button onClick={() => setNickname("Alice")}>Set Alice</button>
      <button onClick={() => clearNickname()}>Clear</button>
    </div>
  );
}

describe("ProfileProvider", () => {
  beforeEach(() => {
    document.cookie = "lit_viewer=; path=/; max-age=0";
  });

  it("reads null when no cookie is set", () => {
    render(
      <ProfileProvider>
        <TestConsumer />
      </ProfileProvider>
    );
    expect(screen.getByTestId("nickname").textContent).toBe("none");
  });

  it("reads existing cookie value", () => {
    document.cookie = "lit_viewer=Bob; path=/; SameSite=Strict";
    render(
      <ProfileProvider>
        <TestConsumer />
      </ProfileProvider>
    );
    expect(screen.getByTestId("nickname").textContent).toBe("Bob");
  });

  it("sets nickname and writes cookie", () => {
    render(
      <ProfileProvider>
        <TestConsumer />
      </ProfileProvider>
    );

    fireEvent.click(screen.getByText("Set Alice"));
    expect(screen.getByTestId("nickname").textContent).toBe("Alice");
    expect(document.cookie).toContain("lit_viewer=Alice");
  });

  it("clears nickname and removes cookie", () => {
    document.cookie = "lit_viewer=Bob; path=/; SameSite=Strict";
    render(
      <ProfileProvider>
        <TestConsumer />
      </ProfileProvider>
    );

    expect(screen.getByTestId("nickname").textContent).toBe("Bob");
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByTestId("nickname").textContent).toBe("none");
  });

  it("ignores empty string nicknames", () => {
    function SetEmpty() {
      const { setNickname, nickname } = useProfile();
      return (
        <div>
          <span data-testid="nick">{nickname ?? "none"}</span>
          <button onClick={() => setNickname("   ")}>Set empty</button>
        </div>
      );
    }

    render(
      <ProfileProvider>
        <SetEmpty />
      </ProfileProvider>
    );

    fireEvent.click(screen.getByText("Set empty"));
    expect(screen.getByTestId("nick").textContent).toBe("none");
  });

  it("provides default values outside of provider", () => {
    render(<TestConsumer />);
    expect(screen.getByTestId("nickname").textContent).toBe("none");
  });

  it("decodes URL-encoded cookie values", () => {
    document.cookie = "lit_viewer=%E5%A4%AA%E9%83%8E; path=/; SameSite=Strict";
    render(
      <ProfileProvider>
        <TestConsumer />
      </ProfileProvider>
    );
    expect(screen.getByTestId("nickname").textContent).toBe("\u592A\u90CE");
  });
});
