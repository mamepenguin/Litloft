import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { startServer } from "./server";

export default async function globalSetup(): Promise<() => Promise<void>> {
  execFileSync(process.execPath, [join(__dirname, "..", "scripts", "copy-foliate.mjs")]);
  const { server, origin } = await startServer();
  process.env.EPUB_E2E_ORIGIN = origin;
  return () => new Promise((resolve) => server.close(() => resolve()));
}
