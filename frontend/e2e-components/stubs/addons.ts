import type { SlotModule } from "../../src/lib/addons";

import { TranscriptSlot } from "./transcriptSlot";

export * from "../../src/lib/addons";

/** The addon modules are not in the fixture; the transcript stands in for one. */
export function loadAddonSlotModule(addonName: string): Promise<SlotModule> {
  if (addonName !== "intelligence") {
    return Promise.reject(new Error(`No fixture slot module for ${addonName}`));
  }
  return Promise.resolve({
    slotComponents: { transcript: TranscriptSlot },
  } as unknown as SlotModule);
}

export function getCachedSlotModule(): SlotModule | undefined {
  return undefined;
}
