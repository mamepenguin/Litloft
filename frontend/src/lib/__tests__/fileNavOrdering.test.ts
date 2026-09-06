/**
 * Which sequence the prev/next arrows walk, and whether it can be
 * counted.
 *
 * The ruling: a count is drawn only when the readout, the arrows and
 * the listing are the same sequence. A wrong `N` says a file is there
 * that nothing can reach.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { resolveFileNavOrdering } from "../fileNavOrdering";

const params = (qs = "") => new URLSearchParams(qs);

/** The shape `useFolderViewMode` stores per drive. */
function storeFolderSort(
  drive: string,
  folderPath: string,
  sort: string,
  order: string,
) {
  localStorage.setItem(
    `folderPrefs:${drive}`,
    JSON.stringify({ [folderPath]: { sort, order } }),
  );
}

beforeEach(() => localStorage.clear());

describe("resolveFileNavOrdering", () => {
  it("follows the folder's stored order, not the URL's", () => {
    // The listing keeps a folder-anchored sort in localStorage and never
    // writes it to the URL. Reading `?sort=` walked `created_at desc`
    // while the reader looked at "Name A-Z", and then printed a place in
    // it: "247 / 995" next to the third row on screen.
    storeFolderSort("media", "photos", "title", "asc");
    const o = resolveFileNavOrdering({
      drive: "media",
      folderPath: "photos",
      params: params("sort=file_size&order=desc"),
    });
    expect(o).toEqual({ sort: "title", order: "asc", countable: true });
  });

  it("counts a plain folder listing", () => {
    const o = resolveFileNavOrdering({
      drive: "media",
      folderPath: "photos",
      params: params(),
    });
    expect(o.countable).toBe(true);
    // The default the listing itself falls back to.
    expect(o.sort).toBe("created_at");
  });

  it("counts the drive root, which has no folder path", () => {
    const o = resolveFileNavOrdering({
      drive: "media",
      folderPath: "",
      params: params(),
    });
    expect(o.countable).toBe(true);
  });

  it("does not count a listing the endpoint cannot reproduce", () => {
    // Each of these is a different population from "this file's folder",
    // and the listing is unmounted the moment a file is selected, so
    // there is nothing left to ask.
    const cases: Array<[string, string]> = [
      ["a search", "q=beach"],
      ["a tag filter", "tag=holiday"],
      ["a smart folder", "smart_folder_id=7"],
      ["a recursive listing", "recursive=true"],
      ["a cross-folder view", "view=favorites"],
      ["the liked view", "view=liked"],
      ["a standalone view", "view=trash"],
    ];
    expect(cases).toHaveLength(7);
    for (const [, qs] of cases) {
      expect(
        resolveFileNavOrdering({
          drive: "media",
          folderPath: "photos",
          params: params(qs),
        }).countable,
      ).toBe(false);
    }
  });

  it("still follows the Liked view's own order while refusing to count it", () => {
    // `liked_at` reaches the endpoint through the URL rather than a
    // folder preference, and the arrows should walk it.
    const o = resolveFileNavOrdering({
      drive: "media",
      folderPath: "photos",
      params: params("view=liked&sort=liked_at&order=desc"),
    });
    expect(o.sort).toBe("liked_at");
    expect(o.order).toBe("desc");
    expect(o.countable).toBe(false);
  });

  it("never forwards a sort the endpoint rejects", () => {
    // `random` and `relevance` order a search result set and are not
    // keysets. Forwarding one 422s, `useFileNav` catches, and the reader
    // gets two permanently disabled arrows — worse than the nothing that
    // was drawn before.
    for (const bad of ["random", "relevance"]) {
      const fromUrl = resolveFileNavOrdering({
        drive: "media",
        folderPath: "photos",
        params: params(`q=x&sort=${bad}`),
      });
      expect(fromUrl.sort).toBeUndefined();

      storeFolderSort("media", "photos", bad, "desc");
      const fromPrefs = resolveFileNavOrdering({
        drive: "media",
        folderPath: "photos",
        params: params(),
      });
      expect(fromPrefs.sort).toBeUndefined();
      // And a random folder is not countable either: there is no place
      // to be in an order that is redrawn every time.
      expect(fromPrefs.countable).toBe(false);
      localStorage.clear();
    }
  });

  it("survives a preference left behind by an older build", () => {
    storeFolderSort("media", "photos", "not_a_field", "sideways");
    const o = resolveFileNavOrdering({
      drive: "media",
      folderPath: "photos",
      params: params(),
    });
    expect(o.sort).toBe("created_at");
    expect(o.countable).toBe(true);
  });
});
