import type { FileProcessing, ProcessingStage } from "@/lib/api";

export type InboxStageDisplay =
  | { kind: "none" }
  | { kind: "unavailable"; failed: boolean }
  | { kind: "stage"; stage: ProcessingStage; failed: boolean }
  | { kind: "ready"; failed: boolean };

function isUnavailable(stage: ProcessingStage): boolean {
  return stage.key === "unavailable";
}

/**
 * An unreachable addon is reported as a stage keyed `unavailable` whose
 * state stays `pending`; the key, not the state, is what the viewer sees.
 */
export function resolveInboxStage(
  stages: readonly ProcessingStage[],
  ready: boolean,
): InboxStageDisplay {
  const failed = stages.some((stage) => stage.state === "failed");
  if (stages.some(isUnavailable)) return { kind: "unavailable", failed };

  const next = stages.find(
    (stage) =>
      stage.required &&
      (stage.state === "running" || stage.state === "pending"),
  );
  if (next) return { kind: "stage", stage: next, failed };
  if (ready) return { kind: "ready", failed };
  return { kind: "none" };
}

/** Whether another 30-second tick could still change this row. */
export function inboxStageNeedsPoll(
  answer: FileProcessing | null | undefined,
): boolean {
  if (!answer) return true;
  if (answer.ready) return false;
  return !answer.stages.some(isUnavailable);
}
