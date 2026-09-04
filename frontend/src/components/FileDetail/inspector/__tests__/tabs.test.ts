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

// The label deliberately differs from the id: with `label: id` a build
// that keyed tabs off the label instead of the id would be
// indistinguishable from a correct one.
const entry = (id: string, priority = 10): SlotEntry => ({
  id,
  label: `manifest label for ${id}`,
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
        // `false` is the one that will actually occur:
        // `chaptersPresent && <ChaptersPanel/>` is how a caller writes a
        // conditional tab, and it yields `false` rather than nullish.
        { id: "pages", label: "Pages", content: false as never },
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

  it("orders addon tabs by the priority they declared", () => {
    // `getSlotEntries` returns the catalogue's raw order and `AddonSlot`
    // — which sorts — is not in this path, so if the composer did not
    // sort, an addon's declared order would be silently dropped.
    const tabs = buildInspectorTabs({
      info,
      addonTabs: [
        { entry: entry("late", 90), label: "Late", content: "l" },
        { entry: entry("early", 10), label: "Early", content: "e" },
      ],
    });
    expect(tabs.map((t) => t.id)).toEqual(["info", "early", "late"]);
  });

  it("puts core's tabs before the addons'", () => {
    const tabs = buildInspectorTabs({
      info,
      coreTabs: [{ id: "chapters", label: "Chapters", content: "rows" }],
      addonTabs: [{ entry: entry("a"), label: "A", content: "a" }],
    });
    expect(tabs.map((t) => t.id)).toEqual(["info", "chapters", "a"]);
  });

  it("keeps an entry that says it has nothing, but takes its button away", () => {
    // Both halves matter. Unlisting is the visible half; still building
    // the tab is what makes the answer revisable — the panel is the
    // thing that reports, so dropping it would freeze the first answer
    // even once the file's transcript arrives.
    const tabs = buildInspectorTabs({
      info,
      addonTabs: [
        { entry: entry("a"), label: "A", content: "a", available: false },
      ],
    });
    expect(tabs.map((t) => t.id)).toEqual(["info", "a"]);
    expect(tabs[1].listed).toBe(false);
    expect(tabs[1].content).toBe("a");
  });

  it("lists an entry that has not answered", () => {
    // An addon written before the signal existed never calls the
    // reporter, and its tab has to keep appearing — otherwise adding
    // this took a working tab away from everyone who had not opted in.
    const tabs = buildInspectorTabs({
      info,
      addonTabs: [{ entry: entry("a"), label: "A", content: "a" }],
    });
    expect(tabs[1].listed).toBe(true);
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

  it("is false when the only other tab has been unlisted", () => {
    // A strip of one is no strip, and an unlisted tab is not one of the
    // one. Counting `tabs.length` here instead would draw a strip whose
    // only button is Info.
    expect(
      showsTabStrip(
        buildInspectorTabs({
          info,
          addonTabs: [
            { entry: entry("a"), label: "A", content: "a", available: false },
          ],
        }),
      ),
    ).toBe(false);
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
