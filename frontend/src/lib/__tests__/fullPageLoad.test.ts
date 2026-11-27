// UNSPEC fix-unlock-refresh
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadFullPage } from "@/lib/fullPageLoad";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadFullPage", () => {
  it("sets the document location, so the browser loads the page from the server", () => {
    const location = { href: "http://host/unlock" };
    vi.stubGlobal("location", location);
    const pushState = vi.spyOn(window.history, "pushState");
    loadFullPage("/drive/a?file=b");
    expect(location.href).toBe("/drive/a?file=b");
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });
});
