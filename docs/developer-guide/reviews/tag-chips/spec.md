# Spec review — `docs/superpowers/specs/2026-09-21-tag-chips.md`

Reviewed at `4208249a8f22e0ef6c8177a7f9b6df7d6e37a8b5` (`feat/tag-chips`, no code commits).
Nothing in the repository was modified.

---

## Part 1 — Factual claims about the existing code

| # | Claim (spec section) | Verdict |
|---|---|---|
| C1 | `suggestions` drives the dropdown open state, keyboard selection and rendering | **true but incomplete** — there is a 4th consumer, see F3 |
| C2 | `submitTag("")` is a no-op (`if (!trimmed) return;`) | **true**, but the design leaves the case it excludes reachable — see F2 |
| C3 | `getDriveTags` omits `folder_path` when falsy, so a root file gets drive-wide tags | **true** |
| C4 | The backend matches `folder_path` as a subtree | **true but incomplete** — see F1 |
| C5 | `getDriveTags` returns `count`, which the component discards | **true** |
| C6 | IME handling is already correct and needs no change | **true** in isolation; the new empty-input state introduces a *new* IME-adjacent break — see F2 |
| C7 | The knowledge addon is unaffected; no submodule pointer bump | **true** |
| C8 | `MarkdownAwareTagChips` passes a full `FileItem`, so it needs no change | **true** |
| C9 | `FilePreview` has the full `FileItem` and drops `folder_path` (and `id`) at the literal | **true** |
| C10 | `backend` needs no change | **false** as stated — see F1; a client-side fix is available, but the spec's reason ("already implemented") is not the whole story |
| C11 | "変更するファイル" lists what must change | **false — incomplete.** Six typecheck sites are missing. See F7 |

### Evidence for the ones that are not plainly true

**C1.** `suggestions` is read at `EditableTagChips.tsx:197` (`open:`), `:246`/`:249`/`:252` (keyboard),
`:322-338` (rows) — and at `:304`, which gates `<DismissScrim>`. The scrim is not a passive
backdrop: it installs a document-level capture listener that dismisses on `pointerdown` and
`preventDefault()`s the click that press produces (`DismissScrim.tsx:108-121`, `:34-63`).

**C4.** `list_drive_tags` does match a subtree (`drives.py:817-822`), but the folder filter is an
`OR` whose first arm is `file_tags.c.file_id.is_(None)` (`drives.py:819`). A `Tag` row with no
`file_tags` rows at all bypasses the folder filter entirely.

**C10.** See F1.

---

## Part 2 — Attempts on the seven invariants

| Inv | Verdict | Where |
|---|---|---|
| 1 — 打鍵後はドライブ全体・最大5件 | **holds** | the non-empty branch is the untouched existing code |
| 2 — ファイルに付いているタグは出ない | **broken** (content mode) | F6 |
| 3 — `localStorage` 例外でも描画・追加・削除できる | **under-specified, breakable** | F8 |
| 4 — チップはフォルダ配下で実際に使われているタグだけ | **broken** | F1 |
| 5 — チップのクリックも同じ検証を通る | **holds** | chips route through `submitTag`, which re-validates length / charset / dup / cap before `commit` |
| 6 — 別ファイルで前のフォルダのチップが出ない | **broken for one paint** | F4 |
| 7 — タグ0のフォルダでは開かない | **broken** | F1 |

Notes on the two that hold:

- **Inv 1** holds because the design only replaces the `return []` arm. The one thing that could
  break it is `commit`'s optimistic `setAllTags` (`:165-169`), which appends newly-typed tags to the
  drive-wide list. That is pre-existing and correct for inv 1 (the tag *is* now in the drive).
- **Inv 5** holds structurally. A `recent` entry from a tampered `localStorage` cannot bypass
  validation twice over: `allowed.has(t)` requires the server to have returned it, and `submitTag`
  re-runs `TAG_RE` / `MAX_TAG_LEN` / `MAX_TAGS` regardless. The `MAX_TAGS` path leaves the dropdown
  open with an inline error rather than closing — same as today's suggestion rows, not introduced.

### Access control (asked for in the brief): no issue found

There is no folder-level visibility in this repo. `list_drive_tags` authorises with
`_validate_drive(drive_name, unlocked_groups)` only (`drives.py:800`), and `design-decisions.md`
makes the **drive** the security boundary. A locked drive 404s before any tag is read, so
"`passwords.json` makes some folders invisible" is not a reachable state. `folder_path` is
user-supplied and goes through `_validate_folder_path` (NUL / `..` / leading `/`), and the value the
component would send originates server-side. No new surface.

---

## Part 3 — Findings

### F1: Orphan `Tag` rows are returned for every folder, breaking invariants 4 and 7
Severity: blocker
Where: `backend/app/routers/drives.py:817-822`; spec §取得, §不変条件 4 and 7
Why: The folder filter is
```python
query = query.filter(
    (file_tags.c.file_id.is_(None))
    | (File.folder_path == folder_path)
    | (File.folder_path.like(_escape_like(folder_path) + "/%", escape="\\"))
)
```
The first arm admits a `Tag` row that has **no** `file_tags` rows at all, whatever `folder_path`
says. Such rows exist: `cleanup_orphan_tags` is called from exactly three places —
`files.py:781` (`PUT /files/{id}/tags`), `files.py:1603` (the `.md` content-PUT tag projection) and
`internal.py:166`. **No purge path calls it**: `fileops.purge_file`, `purge_all_trash`,
`purge_missing_file`, `purge_all_missing` (`fileops.py:742-819`) and the startup trash auto-purge
all delete the `File` and let the `file_tags` rows cascade away, leaving the `Tag` row behind.

Observation that demonstrates it: tag one file `foo`, trash it, purge the trash. `GET
/api/drives/{d}/tags?folder_path=anything/at/all` still returns `{"name": "foo", "count": 0}`.

Consequences in the design as written:
- `allowed = scoped の name 集合` now contains `foo` for **every** folder, so a stale `recent`
  entry passes the filter that the spec calls "設計の主題" — inv 4 is broken by the exact
  mechanism the design exists to prevent.
- `scoped` is non-empty in a folder with zero tags, so `chips` is non-empty and the dropdown opens
  — inv 7 broken.
- Test 3 ("フォルダスコープ外の「最近」は出ない") would pass against a hand-written mock and fail
  against the real server.

Suggested: filter client-side — `scoped.filter(t => t.count > 0)` before building `allowed` and the
frequency fill. The spec already fetches `count` and discards it, so this is the one-line use for
it, and it needs no backend change. (A backend fix — calling `cleanup_orphan_tags` on the purge
paths — is a separate pre-existing defect and should go to the ledger, not into this branch.)

### F2: A stale `selectedIndex` makes Enter on an empty input commit a chip the user never chose
Severity: major
Where: `frontend/src/components/EditableTagChips.tsx:65`, `:202-206`, `:250-256`; spec §差し込み点
Why: `selectedIndex` is never reset — not by `closeInput` (`:202-206`, which resets only `adding`,
`input` and `error`), not on `input` change (`:292`), not by the `[file.id]` effect (`:114-118`).

Today that is safe *because* empty input yields `[]`: `suggestions[selectedIndex]` is `undefined`,
so `handleKeyDown` falls through to `submitTag(input)` = `submitTag("")`, which the spec correctly
identifies as a no-op. The design removes exactly the precondition that made it safe.

Two concrete sequences, both `[introduced]` (they are no-ops at `4208249a`):

1. Press "+ Add tag", type `ab`, press ArrowDown once (`selectedIndex = 0`), then Backspace twice
   back to `""`. `suggestions` now returns the chip list, row 0 renders `aria-selected` and
   highlighted, and Enter commits chip 0. The user deleted their input and pressed Enter; a tag
   they never selected is added.
2. Press "+ Add tag", type, ArrowDown ×3, Escape (`closeInput`, `selectedIndex` stays 2), press
   "+ Add tag" again, press Enter. Chip index 2 is committed with an empty field.

Sequence 1 is reachable through the IME path the feature is for: with an IME, ArrowDown during
composition is swallowed by `isImeKeystroke` (`ime.ts:41`), but ArrowDown *after* `compositionend`
is not, so a user who converted, arrowed, then cleared the field lands in exactly this state.

Suggested: reset `selectedIndex` to `-1` whenever `input` changes and inside `closeInput`. Add a
test to the plan; none of tests 1-9 covers it.

### F3: `DismissScrim` is the fourth consumer of `suggestions`, and arming it on "+ Add tag" costs a click
Severity: major
Where: `EditableTagChips.tsx:304`; `DismissScrim.tsx:34-63`, `:108-121`; spec §差し込み点
Why: The spec claims "空入力時の戻り値を変えるだけで、キーボード操作・配置・描画は無改造で動く"
and lists three consumers. `suggestions.length > 0` also gates `<DismissScrim>` at `:304`, and that
scrim is not inert. It installs a capture-phase `pointerdown` listener on `document` and, on any
press outside the list, calls `swallowTheClickThisPressProduces`, which registers a capture-phase
`click` handler that `preventDefault()`s and `stopPropagation()`s the click the press produces
(`DismissScrim.tsx:41-45`, `:116`).

Today the scrim mounts only after the user has typed. With chips it mounts on the press of
"+ Add tag" in any folder that has tags — i.e. on the common path. Observation: open a file detail,
press "+ Add tag", then click a link or a button anywhere on the page. At `4208249a` the link
fires. Under this design the click is swallowed and only dismisses the input; the user must click
twice.

Suggested: design decision — raise. Either accept the extra click (and say so in the spec, since
the "無改造で動く" sentence currently asserts the opposite), or gate the scrim on
`input.trim().length > 0` so it keeps its present arming point while the rows open earlier.

### F4: The stale-`scoped` clear happens after the render that shows it, so inv 6 fails for one paint — and test 9 would pass anyway
Severity: major
Where: spec §競合状態 and §テスト row 9; `EditableTagChips.tsx:114-118`
Why: The design's guard is "取得エフェクトの先頭で `scoped` を空に戻し、`cancelled` ガードを置く".
An effect body runs *after* the commit that painted the new `file` prop against the old `scoped`
state. React renders with the new `file.folder_path` and the previous folder's `scoped` first, then
clears.

That this component is not remounted on file change is established by the code itself: the
`useEffect(..., [file.id])` at `:114-118` exists precisely to re-seed `tags` on a prop-driven file
switch, and `FileDetailContainer.tsx:180` renders `MarkdownAwareTagChips` with no `key`. That
effect resets `tags` but not `adding`, `input` or `selectedIndex` — so the tag input **stays open
across navigation**, with an empty `input`, which is exactly the state that renders chips. The
previous folder's chips are therefore painted for one frame against the new file.

The test-plan problem is worse than the bug: under `@testing-library/react`, `rerender` is wrapped
in `act()`, which flushes effects before the assertion returns. Test 9 as described would be green
against the post-render clear, against a render-time guard, and against no guard whose effect
happens to run. It measures nothing.

Suggested: make the guard render-time, not effect-time. Keep the fetched value tagged with the key
it was fetched for — `useState<{ folderPath: string; tags: Tag[] } | null>` — and treat
`state.folderPath !== file.folder_path` as empty while deriving `chips`. The stale value then
cannot be rendered at all, and test 9 asserts on the first render rather than on effect ordering.

### F5: A file at the drive root gets drive-wide chips, so the design's motivating case is not covered
Severity: major
Where: spec §取得, §スコープの非対称
Why: The spec's justification is correct on its own terms — `folder_path === ""` is falsy in
`api.ts:110` and in `drives.py:812`, so the request is drive-wide, and a root file's subtree *is*
the drive. But the reason the folder scope exists is stated two sections earlier: "現にドライブの
169 種はすべてレシピ由来で、Knowledge でタグを付けようとすると料理名が並ぶ." For a note that sits
at the drive root, `scoped` is the whole drive, `allowed` is the whole drive, and the top 8 by
count are the recipe names. The design produces exactly the screen it was written to prevent, and
the spec calls this "正しい" without noticing.

Suggested: design decision — raise. Options: (a) accept it and say so explicitly in the spec, since
the current sentence reads as if the case were handled; (b) treat `""` as "files directly in the
root" by using `getDriveTags`'s fourth parameter `path` (`api.ts:106-111`, backend `drives.py:825`,
which matches `File.folder_path == path` exactly), which is well-defined for `""` and is what the
signature's own comment describes.

### F6: `onFile` is compared case-sensitively, producing dead chips in content mode — inv 2
Severity: major
Where: spec §チップの組み立て (`!onFile.has(t)`); `EditableTagChips.tsx:53-59`, `:188-190`, `:220-223`
Why: Everywhere else in this component the file's own tags are compared lowercased — `:188`
(`existing = new Set(tags.map(t => t.toLowerCase()))`) and `:220` (`submitTag`'s dup check). The
spec's chip pseudocode uses a bare `!onFile.has(t)`.

In **content mode** the two casings genuinely diverge: `tags` is seeded from the `.md` frontmatter
(`:53-59`, `extractValidTags(parseNote(content).metadata)`), which is whatever the author typed,
while `scoped` is `Tag.name` from the database. Sequence: a note whose frontmatter says
`tags: [Cooking]` in a drive whose `Tag` row is `cooking`. `onFile = {"Cooking"}`, `scoped`
contains `"cooking"`, `!onFile.has("cooking")` is true → the chip is offered. Clicking it reaches
`:220`, the case-insensitive dup check fires, and `closeInput()` runs with nothing added.

That is inv 2 broken, and it also contradicts the stance the spec itself cites under
`## Checked, no action`: "押しても何も起きないものを出さない".

The same bare comparison in `allowed.has(t)` silently drops a `recent` entry whose casing has
drifted from the drive's `Tag.name` — `replace_file_tags` renames the `Tag` row to the last-written
casing (`files.py:167-170`), so drift across devices is normal, not exotic.

Suggested: build `onFile` and `allowed` as lowercase sets and compare `t.toLowerCase()`, matching
`:188`. Add a content-mode case to test 4.

### F7: The "変更するファイル" list omits six typecheck sites; `tsc` will fail
Severity: major
Where: spec §変更するファイル; `frontend/tsconfig.json` (`include: ["**/*.ts", "**/*.tsx"]`)
Why: `pnpm typecheck` is `tsc --noEmit` over `**/*.tsx`, so test files are typechecked. Making
`folder_path` required propagates into fixtures the spec does not name. The spec's stated benefit —
"必須にすれば `tsc` が漏れを列挙する" — is correct; the list is just short by six.

Full enumeration below (Part 4).

Suggested: add the six test sites to the table, or the branch lands with a red typecheck.

### F8: Invariant 3 is under-specified in two ways that a mutation would exploit
Severity: minor
Where: spec §記録する場所, §変更するファイル (`recentTags.ts`), §不変条件 3
Why: The spec says "読み書き両方 try/catch" and "`recent` への追記は `submitTag` の 1 箇所だけ",
but never says **where inside `submitTag`**. If the write lands before `commit([...tags, trimmed])`
(`:228`), an uncaught throw — or a `QuotaExceededError` that escapes a `try` placed only around
`setItem` and not around the `JSON.stringify` / `localStorage` property access — aborts the tag
add. Inv 3 says the add must still work.

Two further gaps on the read side: `window.localStorage` can throw on **property access**, not only
on `getItem`, when site data is blocked; and `JSON.parse` of a corrupted value throws. Both must be
inside the same `try`, and the catch must yield `[]` rather than propagate.

Nothing in the spec says removal is covered either — inv 3 names "タグの追加と削除" but test 6 only
says "タグを追加できる".

Suggested: state the order — `commit(...)` first, then the `recent` write, wrapped so it cannot
throw. Extend test 6 to assert a removal after a throwing `localStorage`, and to throw from the
property getter as well as from `getItem` / `setItem`.

### F9: Test 9 keys on `file.id`, but the guard keys on the folder — as written it never reaches the guard
Severity: minor
Where: spec §テスト row 9 ("`file.id` が変わったとき、前のファイルのチップが出ない"), inv 6
Why: Two files in the same folder legitimately share chips; the state inv 6 is about is a
**folder** change. A fixture that changes only `id` either (a) does not re-run a fetch effect keyed
on `folder_path`, so the assertion passes with no guard present at all, or (b) passes for the
wrong reason. The mutation that should kill this test — deleting the clear — survives it.

Suggested: change both `file.id` and `file.folder_path`, mock `getDriveTags` to resolve the two
folders with disjoint tag sets, and assert `toBe(0)` occurrences of the first folder's tag names.
Combined with F4's render-time guard, the test then measures something.

### F10: The pseudocode sorts state in place
Severity: minor
Where: spec §チップの組み立て (`scoped.sort(count desc)`)
Why: `Array.prototype.sort` mutates. `scoped` is React state; sorting it in place mutates state
outside a setter and violates `~/.claude/rules/coding-style.md` ("ALWAYS create new objects, NEVER
mutate"). It is also a live hazard here: the `chips` `useMemo` would reorder the array its own
dependency identity is based on, so a later render that reads `scoped` sees a different order with
no state change to explain it.

Suggested: `[...scoped].sort(...)` — or `toSorted`, available on the ES2023 lib this target has via
`lib: ["esnext"]`.

### F11: Two test-plan items the detector rules make load-bearing, plus one missing test
Severity: minor
Where: spec §テスト; `.claude/rules/review-workflow.md` "Detector rules"
Why:
- Test 1 says `toBe(N)` (good), but does not say N is **declared**. Detector rule 5 forbids building
  the expected value out of the observation, and the obvious shortcut here —
  `expect(chips).toHaveLength(mockTags.length)` or `toBe(Math.min(mock.length, CHIP_LIMIT))` —
  cannot catch a deletion, because removing a tag from the mock moves both sides at once. Write the
  expected names out.
- Nothing pins `CHIP_LIMIT`. `.slice(0, CHIP_LIMIT)` is precisely the kind of line a mutation
  removes silently; with a 5-tag fixture no test notices. Fix a fixture with more than 8 eligible
  tags and assert `toBe(8)` with the declared names.
- Nothing tests that a **chip click** writes to `recent`. §記録する場所 argues both paths converge on
  `submitTag`; that convergence is an implementation claim with no test, and routing the chip's
  `onPointerUp` past `submitTag` would break inv 5 and the `recent` write together.

Suggested: add the three items above to the table.

### F12: The fetch effect's dependency list is unspecified, and `folder_path` alone is not enough
Severity: minor
Where: spec §競合状態, §取得
Why: The existing drive-wide fetch keys on `[file.drive]` (`:132`). The scoped fetch needs both
`file.drive` **and** `file.folder_path`: two drives commonly share a folder path (and both share
`""` at the root), so a drive switch with an unchanged path would keep the previous drive's tags —
a cross-drive leak into a UI surface, which `design-decisions.md` treats as a boundary violation
rather than a cosmetic bug. The spec names neither dependency.

Suggested: state `[file.drive, file.folder_path]` explicitly, and make F4's render-time key the
pair rather than the path alone.

---

## Part 4 — Every call site that must change if `folder_path` becomes required

The spec names six files. **The list is not complete**: it misses one declaration inside a file it
does name, and five test files entirely (six sites). All are inside `tsconfig.json`'s
`include: ["**/*.ts", "**/*.tsx"]`, so `pnpm typecheck` fails on each.

### Production — named by the spec (correct as far as it goes)

| File:line | What |
|---|---|
| `frontend/src/components/EditableTagChips.tsx:21` | `type FileRef = Pick<FileItem, "id" \| "mime_type" \| "filename" \| "drive">` |
| `frontend/src/components/PropertiesPanel.tsx:333` | `type EditableRef = Pick<FileItem, ...>` |
| `frontend/src/components/MarkdownPreview.tsx:392-397` | inline `editable?: { id; mime_type; filename; drive }` |
| `frontend/src/components/MarkdownFileViewer.tsx:101-107` | the `edit` object literal |
| `frontend/src/components/FilePreview.tsx:167-171` | the `editable={{ ... }}` literal (source of truth: `file: FileItem` at `:46`) |
| `frontend/src/messages-core/{ja,en}.json` | the new `aria-label` key |

### Production — a second declaration the spec's table skips

| File:line | What |
|---|---|
| `frontend/src/components/MarkdownFileViewer.tsx:28-32` | the component's own `editable?: { mime_type; filename; drive }` prop type — distinct from the `edit` literal at `:101`, and `folder_path` cannot reach `:101` without it |

### Tests and fixtures — none named by the spec

| File:line | What |
|---|---|
| `frontend/src/components/__tests__/EditableTagChips.test.tsx:8-13` | module-level `file` fixture, used by ~20 renders |
| `frontend/src/components/__tests__/anchoredDropdownDefaults.test.tsx:115-120` | inline `file={{ ... }}` literal |
| `frontend/src/components/__tests__/PropertiesPanel.test.tsx:268-273` | the `editable` fixture in `describe("editable mode")` |
| `frontend/src/components/__tests__/MarkdownPreview.test.tsx:184-189` | `<MarkdownPreview editable={{ ... }}>` |
| `frontend/src/components/__tests__/MarkdownPreview.test.tsx:255` | `<MarkdownFileViewer editable={{ ... }}>` |
| `frontend/src/components/__tests__/MarkdownPreview.test.tsx:268` | `<MarkdownFileViewer editable={{ ... }}>` (the rerender) |

Note that `PropertiesPanel.test.tsx` already has a `fakeFile()` helper at `:5-31` that **does**
include `folder_path: ""`; the `editable` fixture at `:268` is a separate hand-written literal that
does not.

### Confirmed *not* to need changing

- `frontend/src/components/MarkdownAwareTagChips.tsx:40-53` — `file: FileItem`, spread whole.
- `frontend/src/components/FileDetail/FileDetailContainer.tsx:180` — passes `file: FileItem`.
- `frontend/src/components/FileDetail/__tests__/harness.tsx:241`
  (`EditableTagChipsStub(props: Record<string, unknown>)`) and the five `vi.mock` sites that use it
  — untyped stubs.
- `addons/knowledge/frontend/Editor.tsx:1315` — `<PropertiesPanel frontmatter={frontmatter}
  hideTags />`, no `editable`. The addon's own tests mock `PropertiesPanel` outright
  (`Editor.mobile.test.tsx:28`, `Editor.registry.test.tsx:35`, `Editor.versions.test.tsx:30`,
  `Editor.fmcard.test.tsx:31`). **No submodule pointer bump** — the spec is right.

### Source-scanning detectors: no action needed

Checked because `.claude/rules/review-workflow.md` calls them out. `anchoredDropdowns.test.ts:62`
and `popup-dismissal.test.ts:121,292` scan `EditableTagChips.tsx` as text. Adding a second
`aria-label` does not move either: `popup-dismissal`'s `strip()` removes every `aria-` needle before
asserting, and `anchoredDropdowns` only needs `ANCHORED_VERTICAL` to stay present. The new
`frontend/src/lib/recentTags.ts` matches neither needle set, so neither declared table grows.

---

## Part 5 — What the spec does not handle

Beyond the findings above, four gaps with no finding of their own because they are scoping
questions rather than defects:

1. **Both fetches fire on mount, for every file opened.** The chip fetch is unconditional, so every
   file-detail view now costs a second tag request even when the user never presses "+ Add tag".
   The spec states the count ("合計 2 リクエストになる") without saying whether that was the intent
   or whether the fetch should wait for `adding`.
2. **Nothing says what happens while `scoped` is in flight.** Press "+ Add tag" before the fetch
   lands and the dropdown is closed, then opens under the cursor a moment later. With F3 unresolved
   that also arms the scrim mid-interaction.
3. **`removeTag` is outside the design.** Removing a tag puts it back in `onFile`'s complement, so
   it reappears as a chip immediately — correct, but nothing in the invariants or tests pins it,
   and it is the one path where `chips` changes without `submitTag` running.
4. **No stated behaviour for `MAX_TAGS`.** At 10 tags every chip click sets `maxCount` and adds
   nothing. Whether the chip list should be suppressed at the cap is unaddressed; the existing
   suggestion list has the same shape, so this is a "does the new surface inherit it" question.

Nothing in `## Checked, no action` covers any of the twelve findings — I read it first and it
addresses `aria-label` scope, chip counts, where `recent` lives, its granularity, `CHIP_LIMIT`
being fixed, and the empty-folder message. None of those overlap.

TOTAL: 12 findings
