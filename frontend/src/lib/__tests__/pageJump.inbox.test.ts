/**
 * SPEC-CORE-032 I15 — the inbox is a destination like Home or Library, so
 * page jump has to reach it by name.
 */

import { describe, it, expect } from "vitest";
import { Inbox } from "lucide-react";

import { FIXED_JUMPS, visibleFixedJumps } from "../pageJump";

const drive = "my drive";

function jump(key: string) {
  const found = FIXED_JUMPS.find((j) => j.key === key);
  if (!found) throw new Error(`no fixed jump named ${key}`);
  return found;
}

describe("SPEC-CORE-032 I15 the inbox entry in page jump", () => {
  it("SPEC-CORE-032 I15 sits directly under Home", () => {
    const keys = FIXED_JUMPS.map((j) => j.key);
    expect(keys.indexOf("inbox")).toBe(keys.indexOf("home") + 1);
  });

  it("SPEC-CORE-032 I15 links to the inbox view of the current drive", () => {
    expect(jump("inbox").href(drive)).toBe("/drive/my%20drive?view=inbox");
  });

  it("SPEC-CORE-032 I15 is named and drawn like the sidebar row", () => {
    expect(jump("inbox").labelKey).toBe("sidebar.inbox");
    expect(jump("inbox").icon).toBe(Inbox);
  });

  it.each([
    ["nothing missing", { missingCount: 0, isAdmin: false }],
    ["missing files", { missingCount: 2, isAdmin: false }],
    ["an admin", { missingCount: 0, isAdmin: true }],
  ])("SPEC-CORE-032 I15 is offered with %s", (_case, ctx) => {
    expect(visibleFixedJumps(ctx).map((j) => j.key)).toContain("inbox");
  });

  it("SPEC-CORE-032 I15 is matched by its own name", () => {
    const inbox = jump("inbox");
    expect(inbox.key).not.toBe(jump("home").key);
    expect(inbox.href(drive)).not.toBe(jump("home").href(drive));
    expect(inbox.href(drive)).not.toBe(jump("library").href(drive));
  });
});
