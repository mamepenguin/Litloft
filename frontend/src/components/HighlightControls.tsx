"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Highlighter } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  buildAnchor,
  type HighlightAnchor,
} from "@/lib/highlightAnchor";
import { clearSelectionWithin } from "@/lib/documentCapture";
import { selectionOffsets } from "@/lib/findMarks";
import {
  MAX_HIGHLIGHT_CHARACTERS,
  useHighlightStore,
} from "@/lib/highlightStore";
import { useHighlightMarksIn } from "@/hooks/useHighlightMarksIn";

interface Candidate extends HighlightAnchor {
  page: number | null;
  anchor: { left: number; top: number; width: number; height: number };
}

interface RemoveTarget {
  id: string;
  left: number;
  top: number;
}

export interface HighlightControlsProps {
  getContainer: () => HTMLElement | null;
  fileId: string | null;
  /** Set on a PDF text layer; omitted for a Markdown or plain-text source. */
  page?: number;
  /** Changes when the text source renders again. */
  renderKey: unknown;
  /** Above an overlay that hosts this container (the PDF full-screen viewer). */
  zIndex?: number;
}

function sameCandidate(
  left: Candidate | null,
  right: Candidate | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.quote === right.quote &&
    left.prefix === right.prefix &&
    left.suffix === right.suffix &&
    left.page === right.page &&
    left.anchor.left === right.anchor.left &&
    left.anchor.top === right.anchor.top &&
    left.anchor.width === right.anchor.width &&
    left.anchor.height === right.anchor.height
  );
}

export function HighlightControls({
  getContainer,
  fileId,
  page,
  renderKey,
  zIndex = 50,
}: HighlightControlsProps) {
  const t = useTranslations("highlight");
  const { store, records } = useHighlightStore(fileId);
  const { resolveAt } = useHighlightMarksIn({
    getContainer,
    records,
    page,
    renderKey,
  });

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const getContainerRef = useRef(getContainer);
  getContainerRef.current = getContainer;
  const savingRef = useRef(false);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    if (!fileId) return;

    const update = () => {
      const container = getContainerRef.current();
      const selection = window.getSelection();
      if (
        !container ||
        !selection ||
        selection.rangeCount !== 1 ||
        selection.isCollapsed
      ) {
        setCandidate(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const offsets = selectionOffsets(container, range);
      if (!offsets) {
        setCandidate(null);
        return;
      }
      const anchor = buildAnchor(offsets.text, offsets.start, offsets.end);
      if (
        anchor.quote.length === 0 ||
        anchor.quote.length > MAX_HIGHLIGHT_CHARACTERS
      ) {
        setCandidate(null);
        return;
      }

      const rect =
        typeof range.getBoundingClientRect === "function"
          ? range.getBoundingClientRect()
          : { left: 0, top: 0, width: 0, height: 0 };
      const next: Candidate = {
        ...anchor,
        page: pageRef.current ?? null,
        anchor: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
      setCandidate((current) => (sameCandidate(current, next) ? current : next));
    };

    document.addEventListener("selectionchange", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("resize", update);
    };
  }, [fileId, page]);

  useEffect(() => {
    if (!fileId) return;
    const container = getContainerRef.current();
    if (!container) return;

    const dismissOnScroll = () => setRemoveTarget(null);
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const record = resolveAt(target, event.clientX, event.clientY);
      if (!record) {
        setRemoveTarget(null);
        return;
      }
      const mark = target.closest("mark");
      const rect = mark?.getBoundingClientRect();
      setRemoveTarget({
        id: record.id,
        left: Math.min(
          window.innerWidth - 44,
          Math.max(8, (rect ? rect.left + rect.width / 2 : event.clientX) - 30),
        ),
        top: Math.max(8, (rect ? rect.top : event.clientY) - 40),
      });
    };

    container.addEventListener("click", onClick);
    window.addEventListener("scroll", dismissOnScroll, true);
    return () => {
      container.removeEventListener("click", onClick);
      window.removeEventListener("scroll", dismissOnScroll, true);
    };
  }, [fileId, resolveAt, renderKey, page]);

  useEffect(() => {
    setRemoveTarget(null);
  }, [page]);

  if (!fileId) return null;

  const add = async () => {
    if (!candidate || !store || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);

    const outcome = await store.save({
      page: candidate.page,
      quote: candidate.quote,
      prefix: candidate.prefix,
      suffix: candidate.suffix,
    });

    savingRef.current = false;
    setSaving(false);

    if (outcome === "saved" || outcome === "duplicate") {
      const container = getContainerRef.current();
      if (container) clearSelectionWithin(container, window.getSelection());
      setCandidate(null);
      setRemoveTarget(null);
      return;
    }
    if (outcome === "limit") setMessage(t("limitReached"));
    if (outcome === "failed") setMessage(t("saveFailed"));
  };

  const remove = async (id: string) => {
    if (!store) return;
    setMessage(null);
    const outcome = await store.remove(id);
    if (outcome === "removed") {
      setRemoveTarget(null);
      return;
    }
    if (outcome === "failed") setMessage(t("removeFailed"));
  };

  const quoteLeft =
    candidate === null
      ? 0
      : Math.min(
          window.innerWidth - 44,
          Math.max(8, candidate.anchor.left + candidate.anchor.width / 2 - 18),
        );
  const addLeft = Math.max(8, quoteLeft - 44);
  const addTop =
    candidate === null ? 0 : Math.max(8, candidate.anchor.top - 44);

  return (
    <>
      {candidate &&
        createPortal(
          <div
            className="fixed"
            style={{ left: addLeft, top: addTop, zIndex }}
          >
            <button
              type="button"
              aria-label={t("add")}
              title={t("add")}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void add()}
              disabled={saving}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bg-border bg-bg-card text-text-muted shadow-card transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <Highlighter size={16} />
            </button>
          </div>,
          document.body,
        )}
      {removeTarget &&
        createPortal(
          <div
            className="fixed"
            style={{
              left: removeTarget.left,
              top: removeTarget.top,
              zIndex,
            }}
          >
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void remove(removeTarget.id)}
              className="inline-flex h-8 items-center rounded-lg border border-bg-border bg-bg-card px-2.5 text-xs text-text-primary shadow-card transition-colors hover:bg-bg-elevated"
            >
              {t("remove")}
            </button>
          </div>,
          document.body,
        )}
      {message &&
        createPortal(
          <p
            role="status"
            style={{ zIndex }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-bg-border bg-bg-card px-3 py-2 text-sm text-danger shadow-card"
          >
            {message}
          </p>,
          document.body,
        )}
    </>
  );
}
