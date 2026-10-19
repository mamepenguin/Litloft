import { describe, expect, it } from "vitest";
import { isStreamPath } from "../../server-routes.js";

describe("isStreamPath", () => {
  it.each([
    "/api/files/AbC123xyz_-9/stream",
    "/api/files/000000000000/stream",
  ])("routes %s straight to the backend", (pathname) => {
    expect(isStreamPath(pathname)).toBe(true);
  });

  it.each([
    "/api/files/AbC123xyz_-/stream",
    "/api/files/AbC123xyz_-99/stream",
    "/api/files/AbC123xyz.-9/stream",
    "/api/files/AbC123xyz_-9/stream/extra",
    "/api/files/AbC123xyz_-9/render",
    "/api/files/AbC123xyz_-9",
    "/x/api/files/AbC123xyz_-9/stream",
  ])("leaves %s to Next.js", (pathname) => {
    expect(isStreamPath(pathname)).toBe(false);
  });
});
