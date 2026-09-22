"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { verifySetupToken } from "@/lib/adminConfig";
import { useImeKeyGuard } from "@/lib/ime";

interface Props {
  value: string;
  onChange: (token: string) => void;
  onUnlocked: () => void;
}

/**
 * This screen precedes the language choice, so it carries no localized prose:
 * the field's name and its one failure word are all the text on it.
 */
export function UnlockStep({
  value,
  onChange,
  onUnlocked,
}: Props): React.ReactElement {
  const ime = useImeKeyGuard();
  const [checking, setChecking] = useState(false);
  const [rejected, setRejected] = useState(false);
  // Only what the URL arrived with is submitted on its own; every later value
  // is something being typed, and verifying each keystroke would reject it.
  const fromUrl = useRef(value);

  const submit = useCallback(
    async (token: string) => {
      setChecking(true);
      setRejected(false);
      try {
        await verifySetupToken(token);
        onUnlocked();
      } catch {
        setRejected(true);
      } finally {
        setChecking(false);
      }
    },
    [onUnlocked],
  );

  // A token in the URL — what configure.py prints — passes without a press.
  useEffect(() => {
    if (fromUrl.current) void submit(fromUrl.current);
  }, [submit]);

  return (
    <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
      <div className="space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold text-accent">Litloft</h1>
          <p className="mt-2 text-sm text-text-muted">Setup</p>
        </div>

        <label className="block text-left">
          <span className="mb-1 block text-sm font-medium text-text-primary">
            Setup token
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setRejected(false);
              // Trimmed here so the value verified is the value sent: a token
              // pasted out of a log carries whitespace either side.
              onChange(e.target.value.trim());
            }}
            onCompositionEnd={ime.onCompositionEnd}
            onKeyDown={(e) => {
              if (ime.isImeKeystroke(e)) return;
              if (e.key === "Enter" && value) void submit(value);
            }}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-3 font-mono text-base focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
          {rejected && (
            <p className="mt-1 text-xs text-danger">Invalid token</p>
          )}
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void submit(value)}
            disabled={checking || !value}
            aria-label="Unlock setup"
            className="rounded-2xl bg-accent px-5 py-2.5 text-base font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-sand disabled:text-warm-silver"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnlockStep;
