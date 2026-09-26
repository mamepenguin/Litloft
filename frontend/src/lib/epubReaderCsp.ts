// script-src names the reader's own directory instead of 'self' so that a
// drive file served from /api/files/<id>/stream can never load as a script.
// A host-source without a scheme matches the page's own scheme.
const HOST_RE = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

export function epubReaderCsp(host: string | null): string {
  const scriptSrc = host && HOST_RE.test(host) ? `${host}/epub-reader/` : "'none'";
  return [
    "default-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' blob:",
    "img-src blob: data:",
    "font-src blob: data:",
    "media-src blob:",
    "frame-src blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

// The CSP matches script-src paths after percent-decoding, and the server
// decodes %2F before resolving a file, so /epub-reader/..%2F<anything> passes
// the policy while serving a file outside the directory. Only these exact raw
// paths are served under /epub-reader/.
const READER_FILE_RE =
  /^\/epub-reader\/(?:reader\.(?:html|js|css)|(?:core|sanitize)\.js|vendor\/(?:view|epub|epubcfi|paginator|progress|overlayer|text-walker)\.js|vendor\/vendor\/zip\.js)$/;

export function isEpubReaderFile(rawPath: string): boolean {
  return READER_FILE_RE.test(rawPath);
}
