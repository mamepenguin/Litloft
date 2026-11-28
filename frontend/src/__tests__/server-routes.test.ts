import { describe, expect, it } from "vitest";
import { isStreamPath } from "../../server-routes.js";

describe("SPEC-CORE-197 I5: isStreamPath", () => {
  it.each([
    "/api/files/AbC123xyz_-9/stream",
    "/api/files/000000000000/stream",
    "/api/addons/relay/files/AbC123xyz_-9/stream",
    "/api/addons/my_relay-2/files/000000000000/stream",
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
    "/api/addons/Relay/files/AbC123xyz_-9/stream",
    "/api/addons/1relay/files/AbC123xyz_-9/stream",
    "/api/addons//files/AbC123xyz_-9/stream",
    "/api/addons/relay/files/AbC123xyz_-/stream",
    "/api/addons/relay/files/AbC123xyz_-99/stream",
    "/api/addons/relay/files/AbC123xyz_-9/stream/extra",
    "/api/addons/relay/files/AbC123xyz_-9/stream/",
    "/api/addons/relay/AbC123xyz_-9/stream",
    "/api/addons/relay/files/AbC123xyz_-9",
    "/api/internal/files/AbC123xyz_-9/stream",
  ])("leaves %s to Next.js", (pathname) => {
    expect(isStreamPath(pathname)).toBe(false);
  });
});
