import { NextResponse, type NextRequest } from "next/server";

import { epubReaderCsp, isEpubReaderFile, isUnderEpubReader } from "@/lib/epubReaderCsp";

export function proxy(request: NextRequest) {
  const raw = rawPath(request.url);
  if (!isUnderEpubReader(raw)) return NextResponse.next();
  if (!isEpubReaderFile(raw)) return new NextResponse(null, { status: 404 });
  const response = NextResponse.next();
  response.headers.set(
    "Content-Security-Policy",
    epubReaderCsp(request.headers.get("host")),
  );
  return response;
}

function rawPath(url: string): string {
  const afterHost = url.replace(/^[a-z]+:\/\/[^/]*/i, "");
  return afterHost.split(/[?#]/, 1)[0];
}

// Broad on purpose: which encoded spellings a matcher sees depends on how the
// server decodes before matching, so the decision is made in the proxy. A path
// under /_next/ or /api/ cannot decode to one under /epub-reader/.
export const config = {
  matcher: "/((?!_next/|api/).*)",
};
