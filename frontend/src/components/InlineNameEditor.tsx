"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { selectStem, validateFilename } from "@/lib/filename";
import { COMPOSITION_GRACE_MS, IME_KEY_CODE } from "@/lib/ime";


export interface InlineNameEditorProps {
  /** The name as it stands. Shown with its stem pre-selected. */
  initialName: string;
  /**
   * Perform the rename. Reject with an `Error` whose `message` is fit to
   * show the user — it is rendered verbatim.
   */
  onCommit: (next: string) => Promise<void>;
  /**
   * Editing ended without a rename: Escape, an unchanged name, the row
   * unmounting, or a click-away the editor refused to act on. `error` is
   * set only in that last case, so the host can surface transiently what
   * the editor is no longer around to show.
   */
  onCancel: (error?: string) => void;
  /** Falls back to the generic "New name" label. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Rename a file or folder in place.
 *
 * Only mounted on surfaces that display the real filename — the tree rows
 * and folder cards. Grid and list cards show `file.title`, a cosmetic
 * derivation, so editing there would show one string and save another
 * (spec 2026-08-21-inline-rename-and-spring-loaded-drag §2).
 */
export function InlineNameEditor({
  initialName,
  onCommit,
  onCancel,
  ariaLabel,
  className,
}: InlineNameEditorProps) {
  const t = useTranslations("inlineRename");
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const settledRef = useRef(false);
  const compositionEndedAtRef = useRef(0);

  // Read through a ref so the unmount cleanup below can stay on `[]` and
  // still call the current callback.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    const el = inputRef.current;
    if (el) selectStem(el);
  }, []);

  // Editing must end when the row goes away. The tree is virtualized, so
  // a row scrolled out of the window unmounts; leaving the host's
  // `editingPath` set would re-arm the editor later with the user's
  // typing gone.
  useEffect(
    () => () => {
      if (!settledRef.current) onCancelRef.current();
    },
    [],
  );

  const finish = useCallback(
    (reason?: string) => {
      settledRef.current = true;
      onCancel(reason);
    },
    [onCancel],
  );

  /**
   * `active` is a deliberate confirmation (Return / Tab) — the user is
   * looking at the field, so a refusal keeps them in it. A passive commit
   * (clicking elsewhere) that is refused must let go instead: pulling
   * focus back on every click is a trap.
   */
  const commit = useCallback(
    async (mode: "active" | "passive") => {
      if (inFlightRef.current || settledRef.current) return;

      const next = value.trim().normalize("NFC");
      if (next === initialName.trim().normalize("NFC")) {
        finish();
        return;
      }

      const invalid = validateFilename(value);
      if (invalid) {
        if (mode === "active") {
          setError(t(`error.${invalid}`));
          inputRef.current?.focus();
        } else {
          finish();
        }
        return;
      }

      inFlightRef.current = true;
      setError(null);
      try {
        await onCommit(next);
        settledRef.current = true;
      } catch (e) {
        inFlightRef.current = false;
        const message = e instanceof Error ? e.message : String(e);
        if (mode === "active") {
          setError(message);
          inputRef.current?.focus();
        } else {
          finish(message);
        }
      }
    },
    [value, initialName, onCommit, finish, t],
  );

  // Commit triggers are Return, Tab, and a pointerdown outside the field
  // — never `blur`. Blur also fires when a virtualized row scrolls out of
  // view and when the window loses focus, and renaming a file because the
  // user scrolled or switched apps is a data-mutating accident.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const el = inputRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      void commit("passive");
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [commit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // An IME is mid-conversion: every key belongs to it, not to us.
    if (e.nativeEvent.isComposing || e.keyCode === IME_KEY_CODE) return;

    // The keystroke that *confirmed* a conversion still reaches the page,
    // and measurement says it is indistinguishable from a bare press —
    // `compositionend` fires first, then `keydown` with `key: "Enter"`,
    // `isComposing: false`, `keyCode: 13`. Checking `isComposing` alone
    // therefore does not help. Swallow one Enter or Escape immediately
    // after a composition ends: confirming a conversion must not also
    // commit the rename, and cancelling one must not abandon the edit.
    //
    // The window keeps this from eating a deliberate keystroke. Choosing
    // a candidate with the mouse also ends the composition, and reaching
    // for the keyboard afterwards takes far longer than this.
    if (
      (e.key === "Enter" || e.key === "Escape") &&
      Date.now() - compositionEndedAtRef.current < COMPOSITION_GRACE_MS
    ) {
      compositionEndedAtRef.current = 0;
      return;
    }

    // The row underneath is a drag source and a navigation target; none of
    // these keys should reach it.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      void commit("active");
    }
  };

  return (
    <span className={`flex min-w-0 flex-1 flex-col ${className ?? ""}`.trim()}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        aria-label={ariaLabel ?? t("label")}
        aria-invalid={error !== null}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={handleKeyDown}
        onCompositionEnd={() => {
          compositionEndedAtRef.current = Date.now();
        }}
        // Keep the surrounding row from claiming the gesture: a text
        // selection inside a `draggable` ancestor is otherwise swallowed
        // by the drag system.
        onDragStart={(e) => e.preventDefault()}
        className="w-full min-w-0 rounded-lg border border-focus-ring bg-bg-elevated px-1.5 py-0.5 text-sm text-text-primary outline-none"
      />
      {error && (
        <span role="alert" className="mt-0.5 truncate text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
