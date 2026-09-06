"use client";

import { useState } from "react";

import type { ViewMode } from "@/types";

/**
 * The archives whose layout the reader has chosen for themselves.
 *
 * Keyed by archive, not global. A single stored mode — what this held before
 * — makes one choice inside one ZIP the answer for every ZIP afterwards,
 * which is the thing ARC-3's derivation exists to stop: the reader who put a
 * code archive in list view would never see a grid of comic pages again.
 * The old `archive-view-mode` key is deliberately not read; it holds exactly
 * that global answer.
 */
const STORAGE_KEY = "archive-view-choices";

/**
 * How many archives are remembered.
 *
 * The list is unbounded otherwise, and localStorage is a shared 5MB budget —
 * a reader who opens a thousand archives would spend it on the answer to a
 * question they stopped asking. Most-recent-first, so the cap drops the
 * archive touched longest ago.
 */
const MAX_REMEMBERED = 50;

interface Choice {
  id: string;
  mode: ViewMode;
}

function isViewMode(value: unknown): value is ViewMode {
  return value === "grid" || value === "list";
}

function readChoices(): Choice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Choice =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Choice).id === "string" &&
        isViewMode((item as Choice).mode)
    );
  } catch {
    // A hand-edited or half-written value is not worth a broken viewer.
    return [];
  }
}

function readChoice(archiveId: string): ViewMode | null {
  return readChoices().find((c) => c.id === archiveId)?.mode ?? null;
}

function writeChoice(archiveId: string, mode: ViewMode) {
  const next = [
    { id: archiveId, mode },
    ...readChoices().filter((c) => c.id !== archiveId),
  ].slice(0, MAX_REMEMBERED);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing and a full quota both throw here. The choice still
    // holds for this visit; only its memory is lost.
  }
}

interface UseArchiveViewModeResult {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

/**
 * The layout this level is drawn in.
 *
 * `derivedMode` is recomputed by the caller for every level, so an untouched
 * archive changes shape as the reader walks into it. One press ends that for
 * this archive: an explicit choice is never overridden by a derivation,
 * because the reader has already seen what the derivation picked and said
 * otherwise.
 */
export function useArchiveViewMode(
  archiveId: string,
  derivedMode: ViewMode
): UseArchiveViewModeResult {
  const [chosen, setChosen] = useState<ViewMode | null>(() =>
    readChoice(archiveId)
  );
  // Opening a different archive inside the same mounted viewer starts its
  // derivation over. Stored as state rather than read every render so the
  // reader's press during this visit outlives a write that localStorage
  // refused.
  const [seenId, setSeenId] = useState(archiveId);
  if (seenId !== archiveId) {
    setSeenId(archiveId);
    setChosen(readChoice(archiveId));
  }

  function setViewMode(mode: ViewMode) {
    writeChoice(archiveId, mode);
    setChosen(mode);
  }

  return { viewMode: chosen ?? derivedMode, setViewMode };
}
