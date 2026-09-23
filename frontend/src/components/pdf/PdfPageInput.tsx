"use client";

import { useEffect, useRef, useState } from "react";

import { useImeKeyGuard } from "@/lib/ime";
import { parsePageInput } from "@/lib/pdfController";

export function PdfPageInput({
  page,
  numPages,
  onCommit,
  label,
  className,
}: {
  page: number;
  numPages: number;
  onCommit: (page: number) => void;
  label: string;
  className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ime = useImeKeyGuard();

  /**
   * The page can move underneath a draft, and a box still reading `9`
   * while the canvas is on 3 is a counter that lies about where the reader
   * is.
   */
  useEffect(() => {
    setDraft(null);
  }, [page]);

  /**
   * `blur()` re-enters React's `onBlur` synchronously, and the handler there
   * closes over the `draft` from *before* `setDraft(null)`. A ref is read at
   * the moment the blur runs, which a state update is not.
   */
  const abandoningRef = useRef(false);

  const commit = () => {
    if (abandoningRef.current) {
      abandoningRef.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const parsed = parsePageInput(draft, numPages);
    // Out of range puts the box back rather than moving the page. A reader
    // who typed `999` into a 225-page document and landed on 225 cannot tell
    // that from the number having been accepted.
    if (parsed !== null) onCommit(parsed);
    setDraft(null);
  };

  return (
    // `text`, not `number`: the spinner a browser draws does not fit a box
    // sized to the page count. `inputMode` still brings up the numeric keypad.
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={draft ?? String(page)}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onCompositionEnd={ime.onCompositionEnd}
      onKeyDown={(e) => {
        if (ime.isImeKeystroke(e)) return;

        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          inputRef.current?.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          // Both halves: the state update is what puts the box back, and the
          // ref is what stops the blur this triggers from committing the
          // draft it still closes over.
          abandoningRef.current = true;
          setDraft(null);
          inputRef.current?.blur();
        }
      }}
      style={{ width: `${String(numPages || 1).length + 2}ch` }}
      className={className}
    />
  );
}
