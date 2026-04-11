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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
