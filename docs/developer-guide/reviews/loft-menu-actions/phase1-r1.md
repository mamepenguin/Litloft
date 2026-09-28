# Review: Phase 1 core store, commit 2dc42813f, round 1

Reviewed: `2dc42813f6ac7105fc1d3817ce1396ff4b4c0d71` (HEAD at review time, tree unmoved).
Files: `frontend/src/lib/fileAiActions.ts`, `frontend/src/lib/__tests__/fileAiActions.test.tsx`.
Baseline: `pnpm vitest run src/lib/__tests__/fileAiActions.test.tsx` → 7/7 pass.

## Touch points reached by the diff but not in the list

None. The diff adds two new files; nothing in core imports `@/lib/fileAiActions`
(grep over `frontend/src` outside `src/addons`: only its own test). The
repo-wide text detectors under `frontend/src/__tests__/` (46 files, including
`server-client-boundary`, `escape-listeners`, `design-tokens`) all pass with the
new file present. The only listed touch point this commit reaches is the store
itself.

Invariant 3 check: `fileAiActions.ts` names no addon and no action id (grep for
intelligence/media/tags/summary/chapter/transcri: no hit outside the `import`
keyword).

## Mutation table

Command per mutation: `pnpm vitest run src/lib/__tests__/fileAiActions.test.tsx`,
tree restored with `git checkout -- frontend/src/lib/fileAiActions.ts` after the
run. `git status` clean for both files at the end.

| # | Mutation | want | result | killing test |
|---|---|---|---|---|
| M1 | comparator `b.order - a.order` | kill | killed | lists offers by ascending order, then by id |
| M2 | drop id tie-break | kill | killed | lists offers by ascending order… |
| M3 | reverse id tie-break | kill | killed | lists offers by ascending order… |
| M4 | no sort | kill | killed | lists offers by ascending order… |
| M5 | `offer`: fresh inner map per offer (last registrant overwrites the others) | kill | **survived** | — (see F1) |
| M6 | `withdraw`: keep empty per-id map | live | survived | — (equivalent: `read` skips empty maps) |
| M7 | `withdraw`: keep empty per-file map | live | survived | — (memory only) |
| M8 | `withdraw`: no `publish()` | kill | killed | withdraws an offer when it stops being active |
| M9 | `withdraw`: delete the whole id regardless of registrant | kill | killed | keeps an offer listed while another mount… |
| M10 | `publish`: keep stale snapshots | kill | killed | 5 tests |
| M11 | `read`: no snapshot cache | kill | killed | all 7 |
| M12 | `read`: fresh `[]` instead of `EMPTY` | live | survived | — (cached, so still stable) |
| M13 | `read`: last registrant instead of first | live | survived | — (see F5) |
| M14 | deps: drop `label` | kill | **survived** | — (see F3) |
| M15 | deps: drop `icon` | kill | **survived** | — (see F3) |
| M16 | deps: drop `busy` | kill | **survived** | — (see F3) |
| M17 | deps: drop `label`+`icon`+`busy` | kill | killed | carries the offer's label, icon and busy flag… |
| M18 | deps: drop `order` | kill | survived | — (constant per call site; no finding) |
| M19 | deps: drop `fileId` | kill | **survived** | — (see F2) |
| M20 | deps: drop `id` | kill | survived | — (constant per call site; no finding) |
| M21 | deps: drop `active` | kill | killed | withdraws an offer when it stops being active |
| M22 | deps: add `run` (republish every render with an inline `run`) | kill | **survived** | — (see F4) |
| M23 | publish `run` itself, not via ref | kill | killed | runs the offerer's latest callback |
| M24 | `runRef` never updated | kill | killed | runs the offerer's latest callback |
| M25 | `if (!active) return` removed | kill | killed | withdraws an offer when it stops being active |
| M26 | registrant: new `Symbol` every render | kill | **survived** | — (see F4) |
| M27 | registrant: one shared symbol per id (`Symbol.for`) | kill | killed | keeps an offer listed while another mount… |
| M28 | `read`: ignore `fileId` (all files) | kill | killed | keeps each file's offers to that file |
| M29 | `resetFileAiActions`: no `registry.clear()` | kill | survived | — (RTL auto-cleanup unmounts every hook, so each test's offers are withdrawn anyway; my `want` was wrong; no finding) |
| M30 | never unsubscribe | live | survived | — (leak only) |
| M31 | `publish` notifies nobody | kill | killed | 2 tests |
| M32 | reader `getSnapshot` deps `[]` (stale `fileId`) | live | survived | — (declared live; on reflection it should be kill, see F2) |
| M33 | effect cleanup does not withdraw | kill | killed | withdraws an offer when it stops being active |
| M34 | `busy` default `true` | kill | killed | carries the offer's label, icon and busy flag… |
| M35 | withdraw guard: clear all registrants | kill | killed | keeps an offer listed while another mount… |

Survivors against the declared expectation: M5, M14, M15, M16, M19, M22, M26 (and M32 on reflection).

Re-run of the survivors against reproduction tests (temporary file
`src/lib/__tests__/zzReviewTmp.test.tsx`, deleted afterwards): M5 killed by R3,
M19 killed by R2, M16 killed by R4, M26 killed by R7; M14 and M22 still live
against those repros (no repro isolates a label change; R7 used a stable `run`).

## Findings

### F1 [introduced] MEDIUM, invariant 2: the two-mount test only unmounts the mount that was overwritten

Evidence: `fileAiActions.test.tsx:63-70` unmounts `first`, the earlier of the two
mounts. Under M5 (`fileAiActions.ts:45` → `const held = new Map()`, i.e. the second
offer replaces the first registrant's map), `withdraw(first)` finds the second
map, `held.delete(first)` is false, and the offer stays, so the test passes.
The invariant has no order in it; unmounting the *later* mount exposes it.

Reproduction (R3, passes on 2dc42813f, fails under M5):
```ts
renderHook(() => useOfferFileAiAction({ ...base, fileId: "f1", id: "x" }));
const second = renderHook(() => useOfferFileAiAction({ ...base, fileId: "f1", id: "x" }));
const r = renderHook(() => useFileAiActions("f1"));
second.unmount();
expect(r.result.current.map((a) => a.id)).toEqual(["x"]);
```
Remedy suggestion: in the existing test, unmount the second mount too (or instead).
A test that lets an invariant break through is A per R-4.

### F2 [introduced] MEDIUM, invariant 1: nothing holds that an offer follows its component to a new `fileId`

Evidence: the effect deps at `fileAiActions.ts:129` include `fileId`, but no test
re-renders an offerer with a different `fileId`. Under M19 (drop `fileId`), a
mounted offerer that moves from `f1` to `f2` keeps its offer on `f1` and never
offers on `f2`: the offer shows in another file's list. The reader side is the
same (M32: `getSnapshot` with `[]` deps keeps reading the old file). A file
detail route whose sections re-render with new params instead of remounting
hits exactly this path.

Reproduction (R2, passes on 2dc42813f, fails under M19):
```ts
const o = renderHook((p: { fileId: string }) =>
  useOfferFileAiAction({ ...base, fileId: p.fileId, id: "x" }), { initialProps: { fileId: "f1" } });
const r1 = renderHook(() => useFileAiActions("f1"));
const r2 = renderHook(() => useFileAiActions("f2"));
o.rerender({ fileId: "f2" });
expect(r1.result.current.map((a) => a.id)).toEqual([]);
expect(r2.result.current.map((a) => a.id)).toEqual(["x"]);
```
A reader rerendered from `f1` to `f2` would need the same check for M32.
Remedy suggestion: add these rows to the existing per-file isolation test.

### F3 [introduced] LOW: the update test changes `label`, `icon` and `busy` in one rerender

Evidence: `fileAiActions.test.tsx:80-107` changes all three at once, so removing
any single one from the deps (M14, M15, M16) survives: the other two still
change and trigger the republish. The plan's RED line asks for "changing
`busy`/`label` republishes". `busy` feeds invariant 6 (Phase 2), and `label`
changes on a locale switch.
Reproduction: apply M16 (`fileAiActions.ts:129`, drop `busy`) → the suite stays
green; a rerender that changes only `busy: true` leaves the listed `busy` false.
Remedy suggestion: change one field per rerender (a row per field in the same test).

### F4 [introduced] LOW (B): republish-on-every-offerer-render is undetected; with a self-reading offerer it loops

Evidence: the plan lists "an unstable `icon`/`label` identity would republish
every render" as a MEDIUM risk mitigated by "the snapshot-stability test", but
`fileAiActions.test.tsx:120-126` re-renders only the reader. M26 (new registrant
symbol per render) and M22 (`run` in deps) both survive. On the committed code, a
component that both offers and reads the same file with a non-constant `icon`
hits React's "Maximum update depth exceeded" (R6: 54 renders, then throw),
because each publish re-renders the offerer, which re-offers.
Reproduction (R7, kills M26):
```ts
const o = renderHook(() => useOfferFileAiAction({ ...base, fileId: "f1", id: "x" }));
const r = renderHook(() => useFileAiActions("f1"));
const before = r.result.current;
o.rerender();
expect(r.result.current).toBe(before);
```
No current caller passes an unstable icon (the plan uses module-constant lucide
icons) and none both offers and reads, so no invariant breaks today. Record it; if a test is
wanted, rerender the offerer (with an inline `run`) and assert the reader's identity.

### F5 [introduced, behaviour carried over from `addons/intelligence/frontend/fileAiActions.ts`] LOW (B): with two mounts of one id, a `busy` change hands the menu entry to the other mount

Evidence: `read` shows the first registrant in insertion order
(`fileAiActions.ts:74-75`). A `busy` change runs the effect cleanup then `offer`,
which removes and re-inserts that registrant at the end (`:52-58`, `:46`), so the
menu now shows the *other* mount's entry: `busy` false, and its `run`. The
intelligence store has the same offer/withdraw shape.
Reproduction (R4, passes on 2dc42813f): mounts A and B of id `x`; clicking the
entry runs A; A rerenders with `busy: true`; the listed entry reports
`busy: false`, and clicking again calls B's `run` (a second generation starts).
Invariant 2 still holds. The two mounts (inspector and bottom sheet) are
mutually exclusive in practice, so a user is unlikely to hit this. Ledger.

### F6 [introduced] LOW (B): two addons offering the same id are merged silently

Evidence: `offer` keys by `action.id` only (`fileAiActions.ts:45`); two different
addons that pick the same id (with different labels/run) collapse into one entry,
and whichever mounted first wins (R5: labels "A" and "B" → only "A" listed). The
plan relies on an `addon.` prefix convention (`intelligence.*`, `media_import.*`),
and nothing enforces it. Neither the plan's ids nor any current id collide.
Ledger; a doc line in `ADDON-DEVELOPMENT.md` (Phase 4) naming the prefix
convention covers it.

## Also checked, no finding

- React StrictMode double effects (R1): offer listed once, gone after unmount.
- Cross-module use: `@/*` maps to `frontend/src/*` (tsconfig and vitest alias),
  so addon code under `src/addons/<name>` importing `@/lib/fileAiActions` gets the
  same module instance as core.
- `label` as a translated string compares by value, so a re-render with the same
  translation does not republish.
- Prose: nothing that would lead a reader to a wrong code change.

TOTAL: 6 findings
