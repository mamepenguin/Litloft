"use client";

import { useCallback, useEffect, useState } from "react";

export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "failed" };

interface Settled<T> {
  load: () => Promise<T>;
  attempt: number;
  outcome: { status: "loaded"; data: T } | { status: "failed" };
}

/**
 * One request whose result belongs to the `load` that made it. A changed
 * `load` reads as loading at once, so no frame shows the old inputs' result,
 * and a response that outlives its `load` is dropped.
 *
 * `null` is "nothing to ask": idle, no request.
 */
export function useLoad<T>(load: (() => Promise<T>) | null): {
  state: LoadState<T>;
  retry: () => void;
} {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (load === null) return;
    let current = true;
    load().then(
      (data) => {
        if (current) setSettled({ load, attempt, outcome: { status: "loaded", data } });
      },
      () => {
        if (current) setSettled({ load, attempt, outcome: { status: "failed" } });
      },
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  let state: LoadState<T>;
  if (load === null) state = { status: "idle" };
  else if (settled && settled.load === load && settled.attempt === attempt) state = settled.outcome;
  else state = { status: "loading" };
  return { state, retry };
}
