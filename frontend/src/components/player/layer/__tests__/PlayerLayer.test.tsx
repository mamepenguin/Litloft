import { useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";

import { PlayerLayerProvider, PlayerSlot } from "..";

const events: string[] = [];

function ThrowingPlayer(): null {
  throw new Error("the player could not render");
}

function WorkingPlayer({ label }: { label: string }) {
  useEffect(() => {
    events.push(`mount-${label}`);
    return () => {
      events.push(`unmount-${label}`);
    };
  }, [label]);
  return <div data-testid={`player-${label}`} />;
}

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  events.length = 0;
  vi.restoreAllMocks();
});

describe("SPEC-CORE-194 I12: a player that throws while rendering", () => {
  it("SPEC-CORE-194 I12: leaves the page rendered, draws an error card over the slot, and the next file plays", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    function Page({ file }: { file: "broken" | "next" }) {
      return withIntl(
        <PlayerLayerProvider>
          <div data-testid="page-content">the page</div>
          <PlayerSlot key={file}>
            {file === "broken" ? (
              <ThrowingPlayer />
            ) : (
              <WorkingPlayer label={file} />
            )}
          </PlayerSlot>
        </PlayerLayerProvider>,
      );
    }

    const { rerender } = render(<Page file="broken" />);

    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    const card = screen.getByText(enMessages.player.loadFailed);
    expect(card.closest("[data-player-layer]")).not.toBeNull();
    expect(screen.queryByTestId("player-next")).not.toBeInTheDocument();

    rerender(<Page file="next" />);

    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    expect(screen.getByTestId("player-next")).toBeInTheDocument();
    expect(screen.queryByText(enMessages.player.loadFailed)).not.toBeInTheDocument();
    expect(events).toEqual(["mount-next"]);
    quiet.mockRestore();
  });
});

describe("SPEC-CORE-194 I13: a second slot waits for the served one", () => {
  it("SPEC-CORE-194 I13: draws an empty box without a player, and starts its player only after the first is gone", () => {
    function Page({ first }: { first: boolean }) {
      return withIntl(
        <PlayerLayerProvider>
          {first && (
            <PlayerSlot>
              <WorkingPlayer label="a" />
            </PlayerSlot>
          )}
          <PlayerSlot>
            <WorkingPlayer label="b" />
          </PlayerSlot>
        </PlayerLayerProvider>,
      );
    }

    const { rerender, container } = render(<Page first />);

    expect(screen.getByTestId("player-a")).toBeInTheDocument();
    expect(screen.queryByTestId("player-b")).not.toBeInTheDocument();
    const slots = container.querySelectorAll<HTMLElement>("[data-player-slot]");
    expect(slots).toHaveLength(2);
    expect(slots[1].children).toHaveLength(0);
    expect(slots[1].style.aspectRatio).not.toBe("");
    expect(events).toEqual(["mount-a"]);

    rerender(<Page first={false} />);

    expect(screen.queryByTestId("player-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("player-b")).toBeInTheDocument();
    expect(events).toEqual(["mount-a", "unmount-a", "mount-b"]);
  });
});
