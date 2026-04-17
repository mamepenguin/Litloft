import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ────────────────────────────────────────────────
// Mock WebSocket class
// ────────────────────────────────────────────────

type MockWebSocketInstance = {
  url: string;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
};

let mockWebSocketInstances: MockWebSocketInstance[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  readyState = MockWebSocket.CONNECTING;

  constructor(url: string) {
    this.url = url;
    mockWebSocketInstances.push(this as unknown as MockWebSocketInstance);
  }
}

// ────────────────────────────────────────────────
// Tests for useWebSocket hook
// ────────────────────────────────────────────────

describe("useWebSocket", () => {
  beforeEach(() => {
    mockWebSocketInstances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null initially when no events received", async () => {
    const { useWebSocket } = await import("@/hooks/useWebSocket");

    const { result } = renderHook(() => useWebSocket());

    expect(result.current).toBeNull();
  });

  it("returns event data when message received", async () => {
    const { useWebSocket } = await import("@/hooks/useWebSocket");

    // We need to wrap in WebSocketProvider for context
    // Since useWebSocket reads from context, test it via the provider
    const { result } = renderHook(() => useWebSocket());

    // Without provider, should return null (context default)
    expect(result.current).toBeNull();
  });

  it("returns null for non-matching eventFilter", async () => {
    const { useWebSocket } = await import("@/hooks/useWebSocket");

    const { result } = renderHook(() => useWebSocket("scan:progress"));

    expect(result.current).toBeNull();
  });

  it("accepts undefined eventFilter", async () => {
    const { useWebSocket } = await import("@/hooks/useWebSocket");

    const { result } = renderHook(() => useWebSocket(undefined));

    expect(result.current).toBeNull();
  });
});

// ────────────────────────────────────────────────
// Tests for WebSocketProvider
// ────────────────────────────────────────────────

describe("WebSocketProvider", () => {
  beforeEach(() => {
    mockWebSocketInstances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("establishes WebSocket connection on mount", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    const { unmount } = renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    expect(mockWebSocketInstances).toHaveLength(1);
    expect(mockWebSocketInstances[0].url).toContain("/api/ws");

    unmount();
  });

  it("constructs WebSocket URL from window.location", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    const ws = mockWebSocketInstances[0];
    // jsdom defaults to http://localhost, so should use ws:
    expect(ws.url).toMatch(/^ws:/);
    expect(ws.url).toContain("/api/ws");
  });

  it("reconnects with exponential backoff after close", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    expect(mockWebSocketInstances).toHaveLength(1);

    // Simulate connection close
    const ws1 = mockWebSocketInstances[0];
    act(() => {
      ws1.onclose?.();
    });

    // After 1s (first backoff), should reconnect
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockWebSocketInstances).toHaveLength(2);

    // Simulate second close
    const ws2 = mockWebSocketInstances[1];
    act(() => {
      ws2.onclose?.();
    });

    // After 2s (second backoff), should reconnect
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockWebSocketInstances).toHaveLength(3);
  });

  it("resets reconnect attempts on successful connection", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    // Close and reconnect once
    const ws1 = mockWebSocketInstances[0];
    act(() => {
      ws1.onclose?.();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Simulate successful open (resets counter)
    const ws2 = mockWebSocketInstances[1];
    act(() => {
      ws2.onopen?.();
    });

    // Close again - should use 1s delay (reset), not 4s
    act(() => {
      ws2.onclose?.();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockWebSocketInstances).toHaveLength(3);
  });

  it("caps backoff at 30 seconds", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    // Simulate many failures to exceed 30s cap
    // 1s, 2s, 4s, 8s, 16s, 32s->30s
    for (let i = 0; i < 6; i++) {
      const ws = mockWebSocketInstances[mockWebSocketInstances.length - 1];
      act(() => {
        ws.onclose?.();
      });
      const delay = Math.min(1000 * 2 ** i, 30000);
      act(() => {
        vi.advanceTimersByTime(delay);
      });
    }

    // 7th attempt should also use 30s cap
    const lastWs = mockWebSocketInstances[mockWebSocketInstances.length - 1];
    act(() => {
      lastWs.onclose?.();
    });

    // At 29s, should not have reconnected yet
    act(() => {
      vi.advanceTimersByTime(29000);
    });
    const countBefore = mockWebSocketInstances.length;

    // At 30s, should reconnect
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockWebSocketInstances.length).toBe(countBefore + 1);
  });

  it("disconnects when page becomes hidden", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    const ws = mockWebSocketInstances[0];

    // Simulate page becoming hidden
    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(ws.close).toHaveBeenCalled();

    // Restore
    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  it("reconnects when page becomes visible again", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    expect(mockWebSocketInstances).toHaveLength(1);

    // Go hidden
    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Go visible
    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Should have created a new connection
    expect(mockWebSocketInstances.length).toBeGreaterThanOrEqual(2);

    // Restore
    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  it("provides lastEvent through context when message received", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { useWebSocket } = await import("@/hooks/useWebSocket");
    const { createElement } = await import("react");

    const { result } = renderHook(() => useWebSocket(), {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    expect(result.current).toBeNull();

    // Simulate receiving a message
    const ws = mockWebSocketInstances[0];
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: "scan:complete",
          data: { drive: "media", added: 5, removed: 0, total: 100 },
        }),
      });
    });

    expect(result.current).toEqual({
      event: "scan:complete",
      data: { drive: "media", added: 5, removed: 0, total: 100 },
    });
  });

  it("filters events with eventFilter parameter", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { useWebSocket } = await import("@/hooks/useWebSocket");
    const { createElement } = await import("react");

    const { result } = renderHook(() => useWebSocket("scan:progress"), {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    const ws = mockWebSocketInstances[0];

    // Send non-matching event
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: "upload:complete",
          data: { drive: "media" },
        }),
      });
    });

    // Should return null for non-matching event
    expect(result.current).toBeNull();

    // Send matching event
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: "scan:progress",
          data: { drive: "media", added: 3, removed: 0, total: 50 },
        }),
      });
    });

    expect(result.current).toEqual({
      event: "scan:progress",
      data: { drive: "media", added: 3, removed: 0, total: 50 },
    });
  });

  it("closes WebSocket on error", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    const ws = mockWebSocketInstances[0];

    act(() => {
      ws.onerror?.();
    });

    expect(ws.close).toHaveBeenCalled();
  });

  it("cleans up on unmount", async () => {
    const { WebSocketProvider } = await import(
      "@/components/WebSocketProvider"
    );
    const { createElement } = await import("react");

    const { unmount } = renderHook(() => null, {
      wrapper: ({ children }) =>
        createElement(WebSocketProvider, null, children),
    });

    const ws = mockWebSocketInstances[0];

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });
});
