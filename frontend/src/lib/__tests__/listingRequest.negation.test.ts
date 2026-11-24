/**
 * SPEC-CORE-172 sending 3: the listing's new conditions travel on the GET path
 * and on the `getDriveFilesWithFileIds` POST path, and only when set.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { getDriveFiles, getDriveFilesWithFileIds } from "../api";
import { json, installWireFetch } from "@/__tests__/helpers/wireFetch";

const NEW_KEYS = [
  "exclude_tag",
  "exclude_type",
  "exclude_folder",
  "exclude_collection",
  "has_tag",
  "has_collection",
];

const SET = {
  exclude_tag: ["draft", "old"],
  exclude_type: ["pdf", "text"],
  exclude_folder: ["Work", "Work/old"],
  exclude_collection: ["Trip"],
  has_tag: false,
  has_collection: true,
} as const;

const page = { data: [], meta: { total: 0, page: 1, limit: 30 } };

afterEach(() => {
  vi.unstubAllGlobals();
});

function listingAnswer() {
  return json(page);
}

describe("SPEC-CORE-172 sending 3 the listing's new conditions", () => {
  it("writes each parameter on the GET path", async () => {
    const { calls } = installWireFetch(listingAnswer);

    await getDriveFiles("main", SET);

    expect(calls[0].url.searchParams.getAll("exclude_tag")).toEqual(["draft", "old"]);
    expect(calls[0].url.searchParams.getAll("exclude_type")).toEqual(["pdf", "text"]);
    expect(calls[0].url.searchParams.getAll("exclude_folder")).toEqual(["Work", "Work/old"]);
    expect(calls[0].url.searchParams.getAll("exclude_collection")).toEqual(["Trip"]);
    expect(calls[0].url.searchParams.getAll("has_tag")).toEqual(["false"]);
    expect(calls[0].url.searchParams.getAll("has_collection")).toEqual(["true"]);
  });

  it("writes each parameter on the POST path with the file ids in the body", async () => {
    const { calls } = installWireFetch(listingAnswer);

    await getDriveFilesWithFileIds("main", SET, ["a", "b"]);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ file_ids: ["a", "b"] });
    expect(calls[0].url.searchParams.getAll("exclude_tag")).toEqual(["draft", "old"]);
    expect(calls[0].url.searchParams.getAll("exclude_type")).toEqual(["pdf", "text"]);
    expect(calls[0].url.searchParams.getAll("exclude_folder")).toEqual(["Work", "Work/old"]);
    expect(calls[0].url.searchParams.getAll("exclude_collection")).toEqual(["Trip"]);
    expect(calls[0].url.searchParams.getAll("has_tag")).toEqual(["false"]);
    expect(calls[0].url.searchParams.getAll("has_collection")).toEqual(["true"]);
  });

  it("writes none of them when they are unset", async () => {
    const { calls } = installWireFetch(listingAnswer);

    await getDriveFiles("main", { search: "京都" });
    await getDriveFilesWithFileIds("main", { search: "京都" }, []);

    for (const call of calls) {
      for (const key of NEW_KEYS) expect(call.url.searchParams.has(key)).toBe(false);
    }
  });
});
