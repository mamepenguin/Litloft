import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dirtyRegistry } from "../dirtyRegistry";
import { navigationGuard } from "../navigationGuard";

describe("navigationGuard", () => {
  beforeEach(() => {
    navigationGuard.reset();
    dirtyRegistry.reset();
  });

  afterEach(() => {
    navigationGuard.reset();
    dirtyRegistry.reset();
  });

  it("runs the action immediately when nothing is dirty", () => {
    const fn = vi.fn();
    navigationGuard.request(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(navigationGuard.getPending()).toBeNull();
  });

  it("queues the action and notifies subscribers when something is dirty", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const listener = vi.fn();
    const unsubscribe = navigationGuard.subscribe(listener);
    const fn = vi.fn();
    navigationGuard.request(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(navigationGuard.getPending()).not.toBeNull();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("confirm() runs the queued action and clears pending", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const fn = vi.fn();
    navigationGuard.request(fn);
    expect(fn).not.toHaveBeenCalled();
    navigationGuard.confirm();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(navigationGuard.getPending()).toBeNull();
  });

  it("cancel() drops the queued action without running it", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const fn = vi.fn();
    navigationGuard.request(fn);
    navigationGuard.cancel();
    expect(fn).not.toHaveBeenCalled();
    expect(navigationGuard.getPending()).toBeNull();
  });

  it("a second request while one is pending replaces the queued action", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const first = vi.fn();
    const second = vi.fn();
    navigationGuard.request(first);
    navigationGuard.request(second);
    navigationGuard.confirm();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("subscribers see updates on request / confirm / cancel and stop after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = navigationGuard.subscribe(listener);
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    navigationGuard.request(vi.fn());
    navigationGuard.confirm();
    navigationGuard.request(vi.fn());
    navigationGuard.cancel();
    const before = listener.mock.calls.length;
    expect(before).toBeGreaterThanOrEqual(4);
    unsubscribe();
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    navigationGuard.request(vi.fn());
    expect(listener.mock.calls.length).toBe(before);
  });

  it("confirm() with no pending is a no-op", () => {
    expect(() => navigationGuard.confirm()).not.toThrow();
    expect(navigationGuard.getPending()).toBeNull();
  });

  it("dirty cleared between request and confirm: the queued action still runs on confirm", () => {
    dirtyRegistry.set("file-1", "knowledge-editor", true);
    const fn = vi.fn();
    navigationGuard.request(fn);
    dirtyRegistry.set("file-1", "knowledge-editor", false);
    navigationGuard.confirm();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
