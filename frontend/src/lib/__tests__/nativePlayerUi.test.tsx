import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readNativePlayerUiPreference,
  useNativePlayerUiPreference,
} from "../nativePlayerUi";

describe("native player UI preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to Litloft and ignores unreadable values", () => {
    expect(readNativePlayerUiPreference()).toBe("litloft");
    window.localStorage.setItem("native-player-ui", "unexpected");
    expect(readNativePlayerUiPreference()).toBe("litloft");
  });

  it("hydrates a stored browser choice after render", async () => {
    window.localStorage.setItem("native-player-ui", "browser");
    const { result } = renderHook(() => useNativePlayerUiPreference());
    await waitFor(() => expect(result.current[0]).toBe("browser"));
  });

  it("round-trips the choice through state and localStorage", () => {
    const { result } = renderHook(() => useNativePlayerUiPreference());
    act(() => result.current[1]("browser"));
    expect(result.current[0]).toBe("browser");
    expect(window.localStorage.getItem("native-player-ui")).toBe("browser");
  });

  it("degrades to Litloft when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readNativePlayerUiPreference()).toBe("litloft");
  });
});
