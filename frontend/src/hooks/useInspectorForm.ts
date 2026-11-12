"use client";

import { useSyncExternalStore } from "react";

import {
  inspectorFormStore,
  type InspectorFormState,
} from "@/lib/inspectorFormStore";

export function useInspectorForm(fileId: string | undefined): InspectorFormState {
  return useSyncExternalStore(
    inspectorFormStore.subscribe,
    () => inspectorFormStore.get(fileId),
    () => inspectorFormStore.get(undefined),
  );
}
