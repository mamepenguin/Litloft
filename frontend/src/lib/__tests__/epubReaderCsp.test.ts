// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "@/proxy";
import { epubReaderCsp, isEpubReaderFile } from "../epubReaderCsp";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("epubReaderCsp", () => {
  it("names every directive the reader relies on, and nothing else", () => {
    const d = directives(epubReaderCsp("litloft.lan:3000"));
    expect(Object.fromEntries(d)).toEqual({
      "default-src": ["'none'"],
      "script-src": ["litloft.lan:3000/epub-reader/"],
      "style-src": ["'self'", "'unsafe-inline'", "blob:"],
      "img-src": ["blob:", "data:"],
      "font-src": ["blob:", "data:"],
      "media-src": ["blob:"],
      "frame-src": ["blob:"],
      "connect-src": ["'none'"],
      "form-action": ["'none'"],
      "base-uri": ["'none'"],
      "frame-ancestors": ["'self'"],
    });
  });

  it.each([
    "localhost",
    "localhost:3000",
    "192.168.1.10:8080",
    "[::1]:3000",
    "nas.local",
  ])("a host of %s scopes script-src to the reader directory", (host) => {
    expect(directives(epubReaderCsp(host)).get("script-src")).toEqual([`${host}/epub-reader/`]);
  });

  it.each([
    null,
    "",
    "evil; script-src *",
    "a b",
    "host/path",
    "host:3000:1",
    "*",
    "'unsafe-inline'",
  ])("a host of %j closes script-src", (host) => {
    expect(directives(epubReaderCsp(host)).get("script-src")).toEqual(["'none'"]);
  });
});

describe("isEpubReaderFile", () => {
  const served = [
    "/epub-reader/reader.html",
    "/epub-reader/reader.js",
    "/epub-reader/reader.css",
    "/epub-reader/core.js",
    "/epub-reader/sanitize.js",
    "/epub-reader/vendor/view.js",
    "/epub-reader/vendor/epub.js",
    "/epub-reader/vendor/epubcfi.js",
    "/epub-reader/vendor/paginator.js",
    "/epub-reader/vendor/progress.js",
    "/epub-reader/vendor/overlayer.js",
    "/epub-reader/vendor/text-walker.js",
    "/epub-reader/vendor/vendor/zip.js",
  ];

  it("the served set is the set declared", () => {
    expect(served.length).toBe(13);
  });

  it.each(served)("%s is served", (path) => {
    expect(isEpubReaderFile(path)).toBe(true);
  });

  it.each([
    "/epub-reader/",
    "/epub-reader/..%2fapi/files/AAAAAAAAAAAA/stream",
    "/epub-reader/..%2Fapi/files/AAAAAAAAAAAA/stream",
    "/epub-reader/%2e%2e%2fapi/files/AAAAAAAAAAAA/stream",
    "/epub-reader/%2e%2e/api/files/AAAAAAAAAAAA/stream",
    "/epub-reader/../api/files/AAAAAAAAAAAA/stream",
    "/epub-reader/vendor/..%2f..%2fapi/drives",
    "/epub-reader/reader%2ejs",
    "/epub-reader//reader.js",
    "/epub-reader/reader.js/",
    "/epub-reader/vendor/fixed-layout.js",
    "/epub-reader/vendor/LICENSE",
    "/epub-reader/..%5creader.js",
  ])("%s is refused", (path) => {
    expect(isEpubReaderFile(path)).toBe(false);
  });
});

describe("proxy", () => {
  function request(rawPath: string, host = "litloft.lan:3000") {
    return new NextRequest(`http://${host}${rawPath}`, { headers: { host } });
  }

  it("serves a reader file with the policy for the request's host", () => {
    const response = proxy(request("/epub-reader/reader.html"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(
      epubReaderCsp("litloft.lan:3000"),
    );
  });

  it.each([
    "/epub-reader/..%2fapi/files/AAAAAAAAAAAA/stream",
    "/epub-reader/%2e%2e%2fepub-spike/evil.js",
    "/epub-reader/vendor/LICENSE",
  ])("answers 404 for %s", (path) => {
    expect(proxy(request(path)).status).toBe(404);
  });
});
