import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { useIsWideViewport } from "@/hooks/useFocusMode";
import { useIsMobile } from "@/hooks/useIsMobile";

function Probe() {
  const mobile = useIsMobile();
  const wide = useIsWideViewport();
  return <p>{`${mobile ? "mobile" : "desktop"} ${wide ? "wide" : "narrow"}`}</p>;
}

const originalWidth = window.innerWidth;

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  document.body.innerHTML = "";
});

describe("viewport width hooks across hydration", () => {
  // UNSPEC: a server-rendered page hydrates at any width without a mismatch,
  // and the width hooks report the real width once hydration has finished.
  it.each([390, 700, 1440])(
    "hydrate a server render at %ipx without a mismatch, then report the real width",
    async (width) => {
      const html = renderToString(<Probe />);
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      const recoverable: unknown[] = [];
      await act(async () => {
        hydrateRoot(container, <Probe />, {
          onRecoverableError: (error) => recoverable.push(error),
        });
      });

      expect(recoverable).toEqual([]);
      const mobile = width < 768;
      expect(container.textContent).toBe(
        `${mobile ? "mobile" : "desktop"} ${mobile ? "narrow" : "wide"}`,
      );
    },
  );
});
