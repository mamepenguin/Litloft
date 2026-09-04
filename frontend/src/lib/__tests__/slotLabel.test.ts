/**
 * A manifest's `label` is an English literal, because a manifest is a
 * declaration and not a catalogue. Rendering it directly is how the
 * addon tab reading "Transcript" ended up in a row of Japanese ones.
 */
import { describe, it, expect, vi } from "vitest";

import { slotEntryLabel } from "../slotLabel";

/** next-intl returns the key itself when it cannot resolve one. */
const catalogue =
  (entries: Record<string, string>) =>
  (key: string): string =>
    entries[key] ?? key;

describe("slotEntryLabel", () => {
  it("prefers the translation an entry names", () => {
    expect(
      slotEntryLabel(
        { label: "Transcript", i18n_key: "some-addon.slots.thing" },
        catalogue({ "some-addon.slots.thing": "文字起こし" }),
      ),
    ).toBe("文字起こし");
  });

  it("keeps the manifest label for an entry that names none", () => {
    // Every entry that shipped before `i18n_key` existed. They have to
    // go on working, or adding the field would be a breaking change to
    // every addon at once.
    //
    // The translator must not be consulted at all: real next-intl throws
    // on `t(undefined)`, so a version that fell through to it would
    // reach the catch and return the same answer here while crashing
    // through a fake that merely returns undefined.
    const t = vi.fn((key: string) => key);
    expect(slotEntryLabel({ label: "Transcript" }, t)).toBe("Transcript");
    expect(t).not.toHaveBeenCalled();
  });

  it("falls back when the key resolves to nothing", () => {
    // An addon can declare a key in its manifest before the translation
    // reaches the merged catalogue — the two are separate files and the
    // merge runs at build time. English is a worse answer than Japanese
    // and a much better one than a raw key on screen.
    expect(
      slotEntryLabel(
        { label: "Transcript", i18n_key: "some-addon.slots.thing" },
        catalogue({}),
      ),
    ).toBe("Transcript");
  });

  it("falls back when the translator throws", () => {
    // next-intl can throw rather than return, depending on how the
    // provider is configured. A missing translation must not be able to
    // take the tab strip down with it.
    expect(
      slotEntryLabel({ label: "Transcript", i18n_key: "nope" }, () => {
        throw new Error("MISSING_MESSAGE");
      }),
    ).toBe("Transcript");
  });

  it("falls back when the key comes back with a namespace glued to it", () => {
    // Not hypothetical: a translator scoped to a namespace answers a
    // miss with `<namespace>.<key>`, which is not equal to the key and
    // would otherwise be rendered as a tab label.
    expect(
      slotEntryLabel(
        { label: "Transcript", i18n_key: "some-addon.slots.thing" },
        () => "undefined.some-addon.slots.thing",
      ),
    ).toBe("Transcript");
  });

  it("falls back on an empty translation", () => {
    expect(
      slotEntryLabel(
        { label: "Transcript", i18n_key: "k" },
        catalogue({ k: "" }),
      ),
    ).toBe("Transcript");
  });
});
