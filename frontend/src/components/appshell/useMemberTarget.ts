"use client";

import { useCallback, useEffect, useState } from "react";

import {
  evaluateMemberTarget,
  type MemberEvaluation,
  type MemberTarget,
} from "@/lib/memberTarget";
import type { SmartFolder } from "@/types/smartFolder";

/**
 * One member target's evaluation for the life of the page: run on mount and on
 * a target change, and again on `retry`. A result that outlives its target is
 * dropped.
 */
export function useMemberTarget(
  drive: string,
  folder: SmartFolder | null,
  target: MemberTarget | null,
): { evaluation: MemberEvaluation | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const targetKey =
    target === null || target.kinds.length === 0
      ? null
      : `${drive}\u0000${target.id}`;
  const [held, setHeld] = useState<{ key: string; evaluation: MemberEvaluation } | null>(null);
  const [lastTarget, setLastTarget] = useState(targetKey);
  if (lastTarget !== targetKey) {
    // A target change opens a new visit, even when the target is one this page
    // came back to: the result held for its earlier visit would otherwise
    // stand in for the new evaluation.
    setLastTarget(targetKey);
    setHeld(null);
  }
  const key = targetKey === null ? null : `${targetKey}\u0000${attempt}`;

  useEffect(() => {
    if (key === null || folder === null) return;
    let current = true;
    void evaluateMemberTarget(drive, folder).then((evaluation) => {
      if (current) setHeld({ key, evaluation });
    });
    return () => {
      current = false;
    };
  }, [key, drive, folder]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const evaluation = held !== null && held.key === key ? held.evaluation : null;
  return { evaluation, retry };
}
