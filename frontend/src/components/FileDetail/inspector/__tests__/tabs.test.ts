/**
 * The tab strip is where core and addon meet, and the one place in
 * Phase 2 where getting the design wrong is a rules violation rather
 * than a defect: `.claude/rules/design-decisions.md` forbids core from
 * knowing anything addon-specific, and "Transcript" is the intelligence
 * addon's word.
 *
 * So these tests never name an addon either. They pass slot entries —
 * the generic container core already defines — and check that what
 * comes back depends only on how many there are and what they hold.
 */
import { describe, it, expect } from "vitest";

import { buildInspectorTabs, showsTabStrip } from "../tabs";
import type { SlotEntry } from "@/lib/addons";

const entry = (id: string, priority = 10): SlotEntry => ({
  id,
  label: id,
  priority,
  addonName: "some-addon",
});

const info = { label: "Info", content: "info-body" };

describe("buildInspectorTabs", () => {
  it("always offers the info tab, first", () => {
    const tabs = buildInspectorTabs({ info });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ id: "info", label: "Info" });
  });

  it("adds a core tab that has something in it", () => {
    const tabs = buildInspectorTabs({
      info,
      coreTabs: [{ id: "chapters", label: "Chapters", content: "rows" }],
    });
    expect(tabs.map((t) => t.id)).toEqual(["info", "chapters"]);
  });

  it("drops a core tab that has nothing in it", () => {
    // The redesign's first principle: a thing that does not exist yet
    // does not take a row, and a tab is a row. This is what lets §7's
    // "archives get a page-list tab" mean "when there is a page list",
    // so Phase 4 can give the PDF viewer one and its tab appears with
    // no edit here.
    const tabs = buildInspectorTabs({
      info,
      coreTabs: [
        { id: "chapters", label: "Chapters", content: null },
        { id: "exif", label: "EXIF", content: undefined as never },
      ],
    });
    expect(tabs.map((t) => t.id)).toEqual(["info"]);
  });

  it("gives every slot entry a tab, in the order it was handed them", () => {
    const tabs = buildInspectorTabs({
      info,
      addonTabs: [
        { entry: entry("a", 10), label: "A", content: "a" },
        { entry: entry("b", 20), label: "B", content: "b" },
      ],
    });
    // Exactly three: one core, two addon. A lower bound would pass on a
    // build that dropped one of them.
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.id)).toEqual(["info", "a", "b"]);
  });

  it("puts core's tabs before the addons'", () => {
    const tabs = buildInspectorTabs({
      info,
      coreTabs: [{ id: "chapters", label: "Chapters", content: "rows" }],
      addonTabs: [{ entry: entry("a"), label: "A", content: "a" }],
    });
    expect(tabs.map((t) => t.id)).toEqual(["info", "chapters", "a"]);
  });

  it("uses the label it is given, never the entry's own", () => {
    // The entry's `label` is an English manifest literal. Resolving it
    // is the caller's job (`slotEntryLabel`), and this must not quietly
    // reach past that and use the raw one.
    const tabs = buildInspectorTabs({
      info,
      addonTabs: [
        { entry: entry("a"), label: "文字起こし", content: "a" },
      ],
    });
    expect(tabs[1].label).toBe("文字起こし");
  });
});

describe("showsTabStrip", () => {
  it("is false for one tab", () => {
    // A strip with a single tab is chrome answering a question nobody
    // asked — and it is what makes a Markdown note's inspector look
    // exactly as it did before any of this, which the design asked for.
    expect(showsTabStrip(buildInspectorTabs({ info }))).toBe(false);
  });

  it("is true from two", () => {
    expect(
      showsTabStrip(
        buildInspectorTabs({
          info,
          addonTabs: [{ entry: entry("a"), label: "A", content: "a" }],
        }),
      ),
    ).toBe(true);
  });

  it("is false again when the only other tab has nothing in it", () => {
    // The case that matters for the "below" transcript layout: the
    // addon's panel moves to the canvas, so no entry reaches the strip
    // and the inspector goes back to having no strip at all.
    expect(
      showsTabStrip(
        buildInspectorTabs({
          info,
          coreTabs: [{ id: "chapters", label: "Chapters", content: null }],
        }),
      ),
    ).toBe(false);
  });
});
