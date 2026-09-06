/**
 * Which sequence the prev/next arrows walk, and whether it can be
 * counted.
 *
 * The ruling: a count is drawn only when the readout, the arrows and
 * the listing are the same sequence. A wrong `N` says a file is there
 * that nothing can reach.
 *
 * The cases here are written against the URLs the detail pane actually
 * renders under, not the ones the listing had. `/files/{id}` redirects
 * to the file's own folder and carries only `t / page / highlight /
 * sort / order / edit / nav` — so a table enumerating `view=liked`,
 * `q=`, `smart_folder_id=` and friends would be a table of states this
 * function never sees. That was the previous version of this file.
 */
import { describe, it, expect } from "vitest";

import { PLAIN_FOLDER_NAV, resolveFileNavOrdering } from "../fileNavOrdering";

const at = (qs: string) =>
  resolveFileNavOrdering({ params: new URLSearchParams(qs) });

describe("resolveFileNavOrdering", () => {
  it("counts a listing that said it was a plain folder", () => {
    expect(at("sort=title&order=asc&nav=folder")).toEqual({
      sort: "title",
      order: "asc",
      countable: true,
    });
  });

  it("takes the order from the URL, which is where the listing put it", () => {
    // Both listings write `?sort=&order=` into their file links and the
    // redirect carries them. An earlier version read `folderPrefs`
    // instead — wrong for the drive root, which never writes an entry,
    // and a second source of truth for an ordering the full-screen
    // gallery reads from the URL.
    expect(at("sort=file_size&order=desc&nav=folder").sort).toBe("file_size");
    expect(at("sort=file_size&order=desc&nav=folder").order).toBe("desc");
  });

  it("does not count a listing that said nothing", () => {
    // Everything that is not a plain folder: a search, a tag, a smart
    // folder, Favourites, Liked, Trash, a type or trust filter, the name
    // box, a collection. None of them are distinguishable here after the
    // redirect, which is exactly why none of them set the marker.
    const walked = at("sort=liked_at&order=desc");
    expect(walked.countable).toBe(false);
    // The arrows still walk, and they walk the order the listing named —
    // the Liked view's `liked_at` reaches the endpoint as before.
    expect(walked.sort).toBe("liked_at");
    expect(walked.order).toBe("desc");
  });

  it("does not count a marker it does not recognise", () => {
    expect(at("sort=title&order=asc&nav=collection").countable).toBe(false);
    expect(at("sort=title&order=asc&nav=").countable).toBe(false);
    expect(PLAIN_FOLDER_NAV).toBe("folder");
  });

  it("never forwards a sort the endpoint rejects, and does not count it", () => {
    // `random` and `relevance` order a search result set and are not
    // keysets. Forwarding one 422s, `useFileNav` catches, and the reader
    // gets two permanently disabled arrows — worse than the nothing that
    // was drawn before. `random` has no place to hold in any case.
    for (const bad of ["random", "relevance"]) {
      const o = at(`sort=${bad}&order=desc&nav=folder`);
      expect(o.sort).toBeUndefined();
      expect(o.countable).toBe(false);
    }
  });

  it("does not count a folder whose listing named no order at all", () => {
    // `random` listings emit an empty `sortQuery`, so the marker cannot
    // arrive without a sort; a URL with the marker and no sort is a
    // hand-edited one.
    expect(at("nav=folder").countable).toBe(false);
    expect(at("nav=folder").sort).toBeUndefined();
  });

  it("survives a sort value left behind by an older build", () => {
    expect(at("sort=not_a_field&order=sideways&nav=folder").sort).toBeUndefined();
    expect(at("sort=not_a_field&nav=folder").countable).toBe(false);
  });

  it("counts nothing on a bare URL", () => {
    expect(at("")).toEqual({
      sort: undefined,
      order: undefined,
      countable: false,
    });
  });
});
