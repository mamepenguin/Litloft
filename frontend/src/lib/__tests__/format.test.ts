import { describe, expect, it } from "vitest";
import { formatDuration, formatFileSize } from "../format";

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
