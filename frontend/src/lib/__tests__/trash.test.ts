import { describe, it, expect } from "vitest";
import { getDaysRemaining } from "../trash";

describe("getDaysRemaining", () => {
  it("returns 30 for a file just deleted", () => {
    const now = new Date();
    const result = getDaysRemaining(now.toISOString());
    expect(result).toBe(30);
  });

  it("returns 20 for a file deleted 10 days ago", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = getDaysRemaining(tenDaysAgo.toISOString());
    expect(result).toBe(20);
  });

  it("returns 0 for a file deleted 31 days ago", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const result = getDaysRemaining(thirtyOneDaysAgo.toISOString());
    expect(result).toBe(0);
  });

  it("returns 0 for a file deleted exactly 30 days ago", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = getDaysRemaining(thirtyDaysAgo.toISOString());
    expect(result).toBe(0);
  });

  it("returns 1 for a file deleted 29 days ago", () => {
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const result = getDaysRemaining(twentyNineDaysAgo.toISOString());
    expect(result).toBe(1);
  });
});
