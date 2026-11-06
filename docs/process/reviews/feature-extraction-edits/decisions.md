# Decisions

decision:
ran_in_app: yes
at: f30f8d0e69d075eb5e6d12f233992458661ee4e5
by: agent
evidence: |
  Environment: compose project `litloft-r5-b4` (LITLOFT_PORT=3996), own
  `.r5/override.yml`, scratch drive `scratch`, UI language ja (NEXT_LOCALE=ja).
  The drive held `lecture.mp4`, `inbox/slide-budget.png`, `inbox/frame.png`
  and `Litloft User Guide.pdf`. All four were indexed; Whisper transcribed
  `lecture.mp4` (7 segments) and OCR read `slide-budget.png` (the second
  picture had no text). Screenshots are under
  `docs/process/reviews/feature-extraction-edits/shots/`.

  1. Picture text (SPEC-ADDON-067) — PASS.
  - `slide-budget.png` (`fzLRrskV06av`) showed a **画像の文字** section with
    the OCR text line by line and a **修正** button (01-picture.png).
  - **修正** opened a multi-line field holding the whole text; Cmd/Ctrl+Enter
    saved it. The section then showed **修正済み** and the corrected word
    (02-picture-corrected.png).
  - Search for the new word ネット回線費 returned 1 result, the picture, with
    the **内容一致** badge and the corrected excerpt; search for the old word
    通信費 returned the picture only with **サムネイル** (no **内容一致**), so
    the old text no longer matches (search-ネット回線費.png,
    search-通信費.png).
  - **元の結果に戻す** opened the confirmation
    「修正をすべて取り消し、機械が出した元の結果に戻します。」 with
    **戻す** / **キャンセル** (03-picture-restore-confirm.png); **戻す** put
    the original 通信費 back and removed **修正済み**
    (04-picture-restored.png). Search after that: ネット回線費 0 results,
    通信費 with **内容一致**.
  - The PDF page (`lLOxQjLudwZt`) had no **画像の文字** section
    (07-pdf-no-picture-section.png).
  - After a second correction, the intelligence container was restarted.
    Reopening the picture showed **修正済み** and ネット回線費, not 通信費;
    the corrected text survived the automatic startup path
    (05-picture-after-restart.png).
  - In インデックス詳細 (ファイル操作 → インデックス詳細), the OCR row's
    **再生成** showed
    「このファイルには手で直した箇所があります。再生成すると、修正と保存して
    ある元の結果は消えます。」 with **続ける** / **キャンセル**
    (06-index-details-warning.png). **キャンセル** closed it and the
    **修正済み** mark remained.

  2. Transcript (SPEC-ADDON-070) — PASS.
  - `lecture.mp4` (`hmH46hucQLD-`) opened the **文字起こし** tab in the
    **分割テキスト** view; each of the 3 rows offered **修正**
    (11-transcript-open.png).
  - **修正** opened a single-line field. Saving chunk 0 with
    ハロス東大 → ハロス灯台 and 東大の歴史 → 灯台の歴史 (Enter) showed
    **修正済み** and **元の結果に戻す** in the header
    (12-transcript-corrected.png).
  - The follow-up's forced alignment could not produce words in this stack:
    the log shows `align failed lang=ja (TypeError)`, so the utterance ended
    with no word timings (the spec's no-result outcome, not a retry loop).
    Reopening the file and fetching the player's subtitle source returned
    the corrected utterance as one cue over its span with ハロス灯台;
    visible caption rendering was not observed.
  - Search for ハロス灯台 returned the video with the **音声一致** badge and
    the corrected excerpt; ハロス東大 returned it only with **サムネイル**.
  - **元の結果に戻す** → **戻す** restored the original text, removed
    **修正済み**, and removed the header button (13-transcript-restored.png).
  - Emptying a row (chunk 1) removed it: the **修正** count went 3 → 2; the
    subsequent restore brought it back to 3 (14-transcript-emptied.png).

  3. Layout — PASS for the reachable views.
  - At 1440x900 the picture section and the transcript header stay on one
    line without clipping (01/11/12).
  - At 390x844 the bottom sheet shows **画像の文字** with **修正** and
    **元の結果に戻す**, and the page has no horizontal overflow
    (20-picture-sheet-390.png); the transcript sheet shows
    分割テキスト / 単語 and the row **修正** without overflow
    (21-transcript-390.png). The three-option case (分割テキスト / 単語 /
    外部字幕) was not reachable: this video has no external subtitle track.

pending: |
  - A successful WhisperX alignment of a corrected utterance: the stack's
    `aligner.align` raised `TypeError` for ja, so the no-word fallback was
    observed instead. The revised words themselves were not produced.
  - Refine (AIで整える): needs an LLM profile; none is configured in this
    stack. The corrected-file confirmation and the Refine-after-alignment
    behaviour were not exercised.
  - The three-option transcript header layout (分割テキスト / 単語 / 外部字幕)
    with both 元の結果に戻す and AIで整える present, per the invariants'
    clarification: no external subtitle track existed in the scratch drive.
  - A visible player caption after reopening; the track source (VTT) was
    verified, the rendered caption was not.
