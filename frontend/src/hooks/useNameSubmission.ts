"use client";

import { useCallback, useRef, useState } from "react";

/** The states a name field passes through around its write. */
export interface NameSubmission {
  /** The text the server refused as a duplicate, until the text changes. */
  inUse: string | null;
  /** A request is out. */
  busy: boolean;
  /** Whether a request is out, readable synchronously. */
  isBusy: () => boolean;
  /** Whether `text` is the one the server refused. */
  isRejected: (text: string) => boolean;
  begin: () => void;
  settle: () => void;
  reject: (text: string) => void;
  clear: () => void;
  reset: () => void;
}

export function useNameSubmission(): NameSubmission {
  const [inUse, setInUse] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const isBusy = useCallback(() => busyRef.current, []);

  const begin = useCallback(() => {
    busyRef.current = true;
    setBusy(true);
  }, []);

  const settle = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  const reject = useCallback((text: string) => setInUse(text), []);
  const clear = useCallback(() => setInUse(null), []);

  const reset = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
    setInUse(null);
  }, []);

  const isRejected = useCallback(
    (text: string) => inUse !== null && text === inUse,
    [inUse],
  );

  return { inUse, busy, isBusy, isRejected, begin, settle, reject, clear, reset };
}
