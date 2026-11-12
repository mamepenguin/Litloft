import type { SlotModule } from "../../src/lib/addons";

import { TranscriptSlot } from "./transcriptSlot";

export * from "../../src/lib/addons";

/**
 * The fixture inlines its modules, so there is no network to wait on. A
 * non-zero delay is what keeps one in flight, the way a chunk fetch would.
 */
const MODULE_DELAY_MS = Number(
  new URLSearchParams(location.search).get("module-delay") ?? 0,
);

function module(): SlotModule {
  return {
    slotComponents: { transcript: TranscriptSlot, outline: TranscriptSlot },
  } as unknown as SlotModule;
}

/** The addon modules are not in the fixture; the transcript stands in for one. */
export function loadAddonSlotModule(addonName: string): Promise<SlotModule> {
  if (addonName !== "intelligence") {
    return Promise.reject(new Error(`No fixture slot module for ${addonName}`));
  }
  if (MODULE_DELAY_MS > 0) {
    return new Promise((resolve) =>
      setTimeout(() => resolve(module()), MODULE_DELAY_MS),
    );
  }
  return Promise.resolve(module());
}

export function getCachedSlotModule(): SlotModule | undefined {
  return undefined;
}
