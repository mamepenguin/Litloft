import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SeekableDescription } from "../SeekableDescription";
import type { MediaController } from "@/lib/mediaController";

// Echoes the key and its values so a test can prove the label came out
// of the catalogue rather than a literal baked into the component.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

function makeController(): MediaController {
  return { seek: vi.fn() } as unknown as MediaController;
}

function renderDescription(
  text: string,
  {
    duration = null as number | null,
    controller = makeController() as MediaController | null,
  } = {},
) {
  const result = render(
    <SeekableDescription
      text={text}
      durationSeconds={duration}
      mediaController={controller}
    />,
  );
  return { ...result, controller };
}

describe("SeekableDescription", () => {
  it("seeks to the position a timestamp names", () => {
    const { controller } = renderDescription("冒頭は 1:23 から。");

    fireEvent.click(screen.getByRole("button", { name: /1:23/ }));

    expect(controller!.seek).toHaveBeenCalledWith(83);
  });

  it("seeks each timestamp to its own position", () => {
    const { controller } = renderDescription("0:00 冒頭\n1:02:03 まとめ");

    fireEvent.click(screen.getByRole("button", { name: /0:00/ }));
    fireEvent.click(screen.getByRole("button", { name: /1:02:03/ }));

    expect(controller!.seek).toHaveBeenNthCalledWith(1, 0);
    expect(controller!.seek).toHaveBeenNthCalledWith(2, 3723);
  });

  it("disables its buttons while no controller has arrived", () => {
    renderDescription("1:23", { controller: null });

    expect(screen.getByRole("button", { name: /1:23/ })).toBeDisabled();
  });

  it("enables its buttons once a controller is present", () => {
    renderDescription("1:23");

    expect(screen.getByRole("button", { name: /1:23/ })).toBeEnabled();
  });

  it("labels each button from the message catalogue", () => {
    renderDescription("1:23");

    // The mock echoes `key:{values}`, so a hardcoded string could not
    // produce this.
    expect(
      screen.getByRole("button", { name: /^seekToTime:/ }),
    ).toHaveAccessibleName('seekToTime:{"time":"1:23"}');
  });

  it("renders the text verbatim, newlines and all", () => {
    const source = "0:00 冒頭\n\n詳しくは 12:05 から。";
    const { container } = renderDescription(source);

    expect(container.textContent).toBe(source);
  });

  it("leaves text without timestamps entirely alone", () => {
    const { container } = renderDescription("ここに時刻はありません");

    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("ここに時刻はありません");
  });

  it("does not link a timestamp past the file's length", () => {
    // The wall-clock false positive the duration bound exists to kill.
    const { container } = renderDescription("配信は 21:00 開始", {
      duration: 600,
    });

    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toBe("配信は 21:00 開始");
  });

  it("shows the timestamp text on the button itself", () => {
    renderDescription("1:23");

    expect(screen.getByRole("button")).toHaveTextContent("1:23");
  });

  it("styles an unusable timestamp as body text, not as a dimmed link", () => {
    // Pins spec §5.5. A controller may never arrive, so the disabled
    // state is not only transient, and the reflex here — dimming the
    // accent colour with `disabled:opacity-50` — would leave a
    // permanently dead link looking like a link.
    renderDescription("1:23", { controller: null });

    const className = screen.getByRole("button").className;
    expect(className).toContain("disabled:text-inherit");
    expect(className).not.toMatch(/disabled:opacity/);
  });
});
