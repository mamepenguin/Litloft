# Triage: r2

## Trajectory

This run:
- claude-read: The fixes since r1 add no branch, state or prediction to the transparent-thumbnail code. The r1 findings were about scope: the stacked SPEC-ADDON-024 work. They were resolved by landing #457 on develop (a38e56fe1) and merging origin/develop into the branch (f74509e2f), with f5070e06f recording the r1 decision. This removes the submodule bump and the intelligence docs edit from the reviewed diff. The design is not being patched round after round; the SPEC-CORE-006/007 code is the same as in r1.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: FAIL

Reasons:
- open finding claude-read:F1 is bucket A or BLOCKER

## Findings

A: 1
B: 1
C: 0

### claude-read:F1 — bucket A, LOW, open

Claim: ImageCanvas remembers only the last id whose decode resolved (paintedId). If the canvas goes back to that file before any other file's decode has resolved, the thumbnail is not painted again for it.
Impact: Steps: the viewer opens picture A and A decodes. They step to picture B and leave before B decodes, or B's decode rejects (for example an unsupported format). They step back to A. A's box is then an empty bg-bg-card frame until A's full picture loads, with no thumbnail under it, because the img sits at opacity 0 until onLoad. This happens whenever the component is re-rendered with a new file prop instead of being remounted. The existing file.id effect exists for exactly that case.
Evidence: frontend/src/components/ImageCanvas.tsx:18,21-22: poster = has_thumbnail && paintedId !== file.id. paintedId is set only in the decode resolution (line 31) and is never cleared when file.id changes (the effect at lines 37-46 resets `decoded` but not paintedId). So for A -> B (not decoded) -> A, paintedId === 'A' when A is shown again, and poster is null from the first render.
Repro: In ImageCanvas.test.tsx: render f1, fireEvent.load, resolve decode. Rerender f2 and do not resolve its decode (or reject it). Rerender f1 and assert canvas().style.backgroundImage contains /api/files/f1/thumbnail. By reading the code, this assertion fails because the style is undefined. None of the four new SPEC-CORE-007 tests goes back to a file that was already painted. Not run.
Introduced: introduced
Reviewer bucket: A | Author bucket: 

<details><summary>Proposed fix</summary>

> Clear paintedId (setPaintedId(null)) in the file.id effect next to setDecoded(false), or key the painted state by the current mount of the file instead of by id. Add a test for the A -> B -> A sequence.

</details>

### claude-read:F2 — bucket B, LOW, open

Claim: The new shared-slot guard covers only the transparency migration. A transparent picture in a shared stem slot whose JPEG is still letterboxed falls through to the letterbox branch, which runs generate_image_thumbnail and now writes a WebP into the shared slot.
Impact: Setup: logo.png (RGBA, not 16:9) sits beside logo.jpg, and the shared logo.jpg slot still holds an old 320x180 letterboxed JPEG. The next scan turns the shared slot into a WebP of logo.png. The spec's user-visible claim that such a picture 'keeps its current thumbnail' does not hold on this path. The letterbox rewrite of a shared slot already happened before this change; what this change adds is that the rewrite is now a WebP.
Evidence: backend/app/services/scanner.py:514-539: when _is_flattened_transparent_picture returns False because of the shared check (scanner.py:217-227), control reaches the `elif _is_letterboxed_image_thumbnail` branch. That branch calls gen_fn = generate_image_thumbnail. Since thumbnail.py's change, generate_image_thumbnail picks WebP for a source that carries transparency.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Either apply the same shared-slot skip before the letterbox branch, or accept the case and drop the 'keeps its current thumbnail' sentence for the letterboxed case.

</details>

## Not verified

- claude-read: I did not run any backend or frontend tests. The F1 repro comes from reading the code.
- claude-read: I did not check whether every production caller of FilePreview/ImageCanvas remounts on a file change. If they all do, F1 cannot be reached.
- claude-read: I did not inspect commit fcbff35e2 on its own, or confirm with git that the diff against the base no longer carries the submodule.
- claude-read: I did not check whether ffmpeg's libwebp in the deployed image preserves alpha for every format listed in the spec.
- claude-verify: I ran no tests and executed nothing; every result comes from reading the code.
- claude-verify: I did not check whether FilePreview's parents remount it on a change of file (for example with a key higher up the tree), which would hide F1.
- claude-verify: I did not review files.py content-type handling or the Markdown projection paths.

TOTAL: 2 findings
