import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";

import { useReportPageBackground } from "../useReportPageBackground";

interface StubbedWindow extends Window {
  webkit?: unknown;
  __litloftShell?: { version?: number };
}
let posted: Record<string, unknown>[] = [];

function Page() {
  useReportPageBackground();
  return null;
}

function colours() {
  return posted.filter((m) => m.type === "page.background").map((m) => m.color);
}

// MutationObserver delivers on a microtask.
async function setTheme(theme: string, colour: string) {
  await act(async () => {
    document.documentElement.style.setProperty("--bg-primary", colour);
    document.documentElement.setAttribute("data-theme", theme);
  });
}

beforeEach(() => {
  posted = [];
  (window as StubbedWindow).__litloftShell = { version: 2 };
  (window as StubbedWindow).webkit = {
    messageHandlers: { litloft: { postMessage: (body: unknown) => posted.push(body as Record<string, unknown>) } },
  };
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.style.setProperty("--bg-primary", "#1a0e10");
});

afterEach(() => {
  delete (window as StubbedWindow).webkit;
  delete (window as StubbedWindow).__litloftShell;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.removeProperty("--bg-primary");
});

describe("useReportPageBackground", () => {
  it("tells the shell the page's colour when it mounts", () => {
    render(<Page />);
    expect(posted).toEqual([{ type: "page.background", color: "#1a0e10" }]);
  });

  it("tells the shell again when the theme changes the colour", async () => {
    render(<Page />);
    await setTheme("light", "#ffffff");
    expect(colours()).toEqual(["#1a0e10", "#ffffff"]);
  });

  it("does not repeat a colour the theme change left the same", async () => {
    render(<Page />);
    await setTheme("light", "#1a0e10");
    expect(colours()).toEqual(["#1a0e10"]);
  });

  it("stops listening once unmounted", async () => {
    const { unmount } = render(<Page />);
    unmount();
    await setTheme("light", "#ffffff");
    expect(colours()).toEqual(["#1a0e10"]);
  });

  it("sends nothing to a shell older than the page requires", async () => {
    (window as StubbedWindow).__litloftShell = { version: 1 };
    render(<Page />);
    await setTheme("light", "#ffffff");
    expect(posted).toEqual([]);
  });

  it("sends nothing outside the shell", async () => {
    delete (window as StubbedWindow).webkit;
    render(<Page />);
    await setTheme("light", "#ffffff");
    expect(posted).toEqual([]);
  });
});
