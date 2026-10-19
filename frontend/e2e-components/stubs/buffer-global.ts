/**
 * Next.js supplies `Buffer` to client bundles and vite does not; gray-matter
 * calls `Buffer.from` on every parse.
 */
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as unknown as { Buffer: unknown }).Buffer = {
    from: (input: string) => new TextEncoder().encode(input),
    isBuffer: () => false,
  };
}

export {};
