# Decisions

decision:
ran_in_app: not-applicable
at: 1af6bf52fc
by: author
evidence: Behaviour-preserving refactor of where the focus-mode reading anchor is kept or dropped (frontend/src/hooks/useFocusMode.ts, components/AppShell.tsx, components/FocusModeShortcuts.tsx, lib/readingAnchor.ts). The anchor is still taken at the toggle and spent when the focus layout changes; a toggle that leaves the layout as it was (below 768px) now drops it in AppShell's layout effect instead of not taking it. What a reader sees is pinned by the existing component e2e tests, which the change keeps green: focus-mode-desktop.spec.ts:834 (content keeps its distance across entering and leaving) and :890 (T below 768px leaves no anchor, widening keeps the place the reader scrolled to). Each was shown to fail when the new code was broken: replacing the drop with nothing fails :890, replacing the restore with a drop fails :834. Full gates: lint, tsc, vitest (12899 passed), e2e-components (967 passed), e2e-layout (410 passed, one toolbar-menu sheet-form flake that passed on two reruns). The app was not started.
pending: none
