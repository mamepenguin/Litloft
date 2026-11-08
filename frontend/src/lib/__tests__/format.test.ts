import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDuration, formatFileSize, formatRelativeAge } from "../format";

describe("formatDuration", () => {
  it("formats null as --:--", () => {
    expect(formatDuration(null)).toBe("--:--");
  });

  it("formats seconds under a minute", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("formats hours", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0:00");
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });
});

describe("formatRelativeAge", () => {
  const NOW = new Date("2026-11-09T12:00:00Z");
  const before = (days: number) =>
    new Date(NOW.getTime() - days * 86400000).toISOString();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [3, "3 days ago", "3日前"],
    [14, "2 weeks ago", "2週間前"],
    [240, "8 months ago", "8か月前"],
    [730, "2 years ago", "2年前"],
  ])("names %i days as a relative age in English and Japanese", (days, en, ja) => {
    expect(formatRelativeAge(before(days), "en")).toBe(en);
    expect(formatRelativeAge(before(days), "ja")).toBe(ja);
  });
});
