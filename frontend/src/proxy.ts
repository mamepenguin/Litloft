import { NextResponse, type NextRequest } from "next/server";

import { epubReaderCsp, isEpubReaderFile } from "@/lib/epubReaderCsp";

export function proxy(request: NextRequest) {
  if (!isEpubReaderFile(rawPath(request.url))) {
    return new NextResponse(null, { status: 404 });
  }
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

export const config = {
  matcher: "/epub-reader/:path*",
};
