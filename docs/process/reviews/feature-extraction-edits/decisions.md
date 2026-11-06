# Decisions

decision:
ran_in_app: yes
at: c1679f59d862963e70d67feabba6798959a96e60
by: agent
evidence: |
  Environment: compose project `litloft-r5-b4` (LITLOFT_PORT=3996), own
  `.r5/override.yml`, scratch drive `scratch`, UI language ja (NEXT_LOCALE=ja).
  The drive held `lecture.mp4` (whisper-small), `inbox/slide-budget.png`,
  `inbox/frame.png`, `Litloft User Guide.pdf` and a `lecture.ja.vtt` sidecar so
  the transcript had all three source options. Screenshots are under
  `docs/process/reviews/feature-extraction-edits/shots/` (30-33 are this run).

  Picture text (SPEC-ADDON-067) — PASS.
  - `slide-budget.png` showed **画像の文字** with the OCR text line by line and
    **修正**. The section's controls sit under the text, as design 3a/3c/3e.
  - **修正** opened a multi-line field; Cmd/Ctrl+Enter saved; **修正済み**
    appeared. The mark uses the warm-light badge, not accent-amber.
  - Search for ネット回線費 returned the picture with **内容一致**; 通信費
    returned it only with **サムネイル**, so the replaced text no longer
    matches.
  - **元の結果に戻す** opened a modal confirmation with
    「修正をすべて取り消し、機械が出した元の結果に戻します。」 and
    **戻す** / **キャンセル**; **戻す** restored 通信費 and removed the mark.
  - The PDF page had no **画像の文字** section.
  - After a second correction and an intelligence restart, the picture kept
    **修正済み** and the corrected word; the automatic startup path did not
    overwrite it.
  - インデックス詳細's OCR **再生成** on the corrected picture showed
    「このファイルには手で直した箇所があります。再生成すると、修正と保存して
    ある元の結果は消えます。」; **キャンセル** left the correction in place.
  - At 390x844 the section shows the text first and **修正** /
    **元の結果に戻す** under it; **修正** measured 44 px high, and the edit
    field's **保存** / **キャンセル** measured 44 px
    (33-picture-edit-390.png, 33-picture-controls-390.png).

  Transcript (SPEC-ADDON-070) — PASS.
  - With `lecture.ja.vtt` beside the video, the transcript header showed
    **分割テキスト** / **単語** / **外部字幕**. After one correction the header
    also showed **元の結果に戻す** and **AIで整える**.
  - At 390x844 the outer header wrapped: the toggle row stayed first and
    **元の結果に戻す** and **AIで整える** shared the next row at the right edge
    (same y, right edge 374 px, no horizontal overflow). This matches design
    1c/1e/1f and the invariants' Clarification.
  - Each line's **修正** was 44x44 on the coarse pointer; the edit mode's
    **保存** and **キャンセル** were 44 px high. The quote button's overhang
    started at x=326 while 修正 ended at x=324, so their touch areas do not
    overlap (32-transcript-edit-390.png).
  - **修正** opened a single-line field with Esc / ↵ hints; Enter saved and
    showed **修正済み**; the mark is the warm-light badge and sits under the
    line's text with the AI badge.
  - Emptying a row removed it; **元の結果に戻す** restored it and removed the
    header button. The restore/Refine confirmations are modal dialogs, and
    Refine on a corrected file asked with
    「このファイルには手で直した箇所があります。AIで整えると、修正後の文章も
    書き換わります。」.
  - Search found ハロス灯台 with **音声一致** and the corrected excerpt;
    ハロス東大 returned the video only with **サムネイル**.
  - The forced-alignment path could not produce words in this stack
    (`align failed lang=ja (TypeError)`); the corrected utterance ended with
    no word timings and the subtitle source showed it as one cue over its span.
    Visible caption rendering was not observed.
  - A file-switch while an edit was open could not be produced through the UI:
    the inspector's page row exposed no next/previous-file control in this
    view. The component test `ExtractionEditsReview.test.tsx` covers the
    host's reused mount (rerender to the next file) and shows the field and
    confirmation are dropped.

pending: |
  - A successful WhisperX alignment of a corrected utterance: the stack's
    `aligner.align` raised `TypeError` for ja, so the no-word fallback was
    observed instead.
  - Refine itself (AIで整える): no LLM profile is configured, so only its
    confirmation dialog was exercised.
  - The host's real next/previous-file navigation while editing: the control
    was not exposed in the inspector view; the component-level rerender case
    is covered by `ExtractionEditsReview.test.tsx`.
  - A visibly rendered caption after reopening; the track source (VTT) was
    verified, the rendered caption was not.
