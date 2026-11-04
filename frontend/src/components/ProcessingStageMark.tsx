import { AlertCircle, Check, Loader2, Minus } from "lucide-react";

import type { ProcessingStage } from "@/lib/api";

/** The C2 drawer's label rule: a missing message falls back to the stage key. */
export function processingStageLabel(
  t: (key: string) => string,
  stage: ProcessingStage,
): string {
  const label = t(stage.i18n_key);
  return label === stage.i18n_key ? stage.key : label;
}

export function ProcessingStageIcon({
  stage,
  stopped = false,
}: {
  stage: ProcessingStage;
  stopped?: boolean;
}) {
  if (stage.state === "done") {
    return <Check size={12} className="text-accent-teal" />;
  }
  if (stage.state === "failed") {
    return <AlertCircle size={12} className="text-danger" />;
  }
  if (stopped) {
    return <Minus size={12} className="text-text-muted" />;
  }
  return <Loader2 size={12} className="animate-spin text-text-muted" />;
}
