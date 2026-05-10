"use client";

import { dirtyRegistry } from "./dirtyRegistry";

/**
 * Centralized navigation guard. Other navigation surfaces
 * (``useSelectedFile``, ``useGuardedRouter``, the global
 * ``<DirtyBlocker />`` for popstate / beforeunload) call
 * ``request(fn)`` instead of running their navigation directly:
 *
 *   - if ``dirtyRegistry`` reports nothing dirty, ``fn()`` runs
 *     synchronously, no UI is shown;
 *   - otherwise ``fn`` is queued and subscribers are notified so
 *     the global ``<DirtyBlocker />`` can render its confirm
 *     dialog. The dialog's confirm/cancel buttons map to
 *     ``confirm()`` / ``cancel()``.
 *
 * Phase 2 PR-5 of the right-pane equivalence spec
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md
 * §4.2.2 / §5 Phase 2.2). Replaces the per-hook guard PR-4 added
 * inside ``useFileNav`` so arrow keys, tree clicks, sidebar links,
 * the browser back button and tab close all funnel through the
 * same dialog.
 *
 * Single-pending design: only one navigation can be queued at a
 * time. A second ``request(...)`` while a dialog is open replaces
 * the previous queued action — same behaviour PR-4 chose for
 * "user pressed both arrow keys while the dialog was open".
 *
 * Whole-tab dirty test: we call ``dirtyRegistry.isDirty()`` with
 * no arguments so any dirty source anywhere in the tab triggers
 * the guard. PR-4's hook-local guard scoped to the focused
 * ``fileId``; with a single global dialog that distinction is
 * unnecessary and the simpler semantics are easier to reason
 * about.
 */

type PendingFn = () => void;
type Listener = () => void;

interface PendingNavigation {
  fn: PendingFn;
}

let pending: PendingNavigation | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export const navigationGuard = {
  request(fn: PendingFn): void {
    if (!dirtyRegistry.isDirty()) {
      fn();
      return;
    }
    pending = { fn };
    emit();
  },

  confirm(): void {
    const current = pending;
    pending = null;
    if (current) {
      current.fn();
      emit();
    }
  },

  cancel(): void {
    if (!pending) return;
    pending = null;
    emit();
  },

  getPending(): PendingNavigation | null {
    return pending;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Test helper. Drops the queued action *and* every subscriber so
   * suite teardown does not leak into the next test.
   */
  reset(): void {
    pending = null;
    listeners.clear();
  },
};

export type { PendingNavigation };
