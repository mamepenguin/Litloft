import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Next.js's built-in gzip compression buffers the entire response
  // body before writing, which turns any Server-Sent Events stream
  // into a "wait → get everything at once" experience (see the RAG
  // /ask endpoint). Disable it so the custom server.js proxy and
  // downstream FastAPI can stream chunks through to the browser
  // unmodified. We're a home-LAN deployment with tiny assets, so
  // the transfer-size win from gzip is negligible compared to the
  // UX loss of broken streaming.
  compress: false,
  experimental: {
    // Default is 10MB; the rewrite proxy silently truncates oversized
    // chunk uploads → backend sees a short body → socket hang up.
    // useUpload.ts picks up to 100MB chunks for >10GB files; 128MB
    // leaves headroom for the multipart envelope.
    proxyClientMaxBodySize: "128mb",
  },
  async rewrites() {
    return [
      {
        // Exclude /api/internal/* from the public proxy. The backend's
        // Internal API is for Docker-internal addon ↔ core traffic only;
        // it is not drive-access gated like the public API and several
        // write endpoints accept requests with no viewer cookie. The
        // negative lookahead keeps the standalone server.js edge block
        // (production) and this rewrite (local `pnpm dev`) in agreement.
        // Requests to /api/internal/* fall through to a 404 instead of
        // being forwarded upstream.
        source: "/api/:path((?!internal/|internal$).*)",
        destination: "http://backend:8000/api/:path*",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
