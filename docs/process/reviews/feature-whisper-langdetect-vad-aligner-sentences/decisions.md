# Decisions

decision: continue — user, 2026-10-10: "その進め方でお願いします。#442はマージしました" (merge #442, rebase onto develop so SPEC-ADDON-008 leaves the diff, add a direct splits_number test, review again)
ran_in_app: yes
at: bcb8231f50e0079ce8585eafb337e487efd500dc
by: agent
evidence: |
  SPEC-ADDON-012/013/014 (docs/specs/whisper-langdetect-vad-aligner-sentences.md). Core bcb8231f5
  pins addons/intelligence at d9f5b23; the running intelligence container's whisper.py,
  aligner.py, subtitle_builder.py and digit_separator.py were byte-identical to d9f5b23. Local
  stack (OrbStack), driven through headless Chromium (Playwright) at http://localhost:3000.
  Screenshots and VTT files are in
  docs/process/reviews/feature-whisper-langdetect-refine-digits/r5/addon-012-014/.
  Setup: overrides backed up, then /admin/settings > Intelligence: Transcription provider
  "Whisper local" saved (01-provider-whisper-local.png), "Profile for AI transcript cleanup"
  set to claude and saved (02-refine-routing-claude.png). The intelligence container was then
  recreated with LLM_API_KEY_CLAUDE from Keychain (with_secrets). Each transcription was started
  from the file page > File actions > Index details > Transcription (Whisper) > Regenerate >
  Regenerate.

  012 music opening: music_then_ja.mp3 (PDzOXaOu4k-V, 40 s instrumental, then 60 s JA speech).
  No detection WARNING or INFO was logged, so detection ran and returned a language. Whisper
  reported "Detected language 'ja' with probability 1.00". The Transcript tab shows Japanese,
  punctuated throughout with 。、?! (5 chunks, 378 chars, 29 punctuation marks), starting at
  0:39 "今年のポケモンGOフェスト東京のメイン会場はどんな風か、一緒にチェックお願いします。"
  (03-music-led-ja-transcript.png). The previous R-5 got English text with the spaces lost.
  012 plain clips: CnGV4Y6msVs_60-360s.mp3 (JA, hrrAHpjsRvx4): ja 1.00, 22 chunks, 1985 chars,
  114 punctuation marks. qf4EIrP3_n8_60-360s.mp3 (JA, AXvejOJ7dIe3): ja 1.00, 22 chunks, 2263
  chars, 112 marks. jobs_stanford_60-360s.mp3 (EN, ucI7OXrk-1_r): en 1.00, 22 chunks, 4517
  chars, full sentences. None of them logged a detection WARNING or INFO.
  012 no speech in the first 120 s: silence130_then_ja.mp3 (added for this run: 130 s of
  silence, then the first 60 s of the CnGV4Y6msVs clip; picked up by Library > More actions >
  Rescan, e8kbL2WFrPnS) was transcribed on index. Exactly one INFO: "Language detection skipped
  for .../silence130_then_ja.mp3: 0.0s of speech in the first 120s", no WARNING. Whisper's own
  detection then chose ja 1.00 and the text is Japanese with no punctuation (4 chunks, 359
  chars, 1 mark), i.e. transcribed without a prompt (04-silence130-ja-no-prompt.png).
  012 decode failure: broken.mp3 (v8Z4sz7a3Bnx) Regenerate logs exactly one WARNING "Language
  detection failed ... ffmpeg ... -t 120 ... returned non-zero exit status 69"; transcription
  then ran and completed with 0 segments.

  013: Transcript tab > "Clean up with AI" on the EN clip after the fresh whisper transcript
  (routed to claude, claude-opus-5-5). Job completed: refined 22, skipped 0, aligned 22, aligner
  skipped 0, rechunked 24; no WARNING or ERROR.
  Before: 22 chunks / 4517 chars / 850 word rows. After: 24 chunks / 4500 chars / 844 word rows
  (word rows counted read-only inside the container; chunks and chars from the transcript API
  the Transcript tab uses). A word-level diff of before and after shows only edits, no dropped
  sentence: quotation marks, hyphenation (working-class, hand-calligraphed, sans-serif,
  well-worn), Waz -> Woz, numbers as digits (six -> 6, five -cent -> 5-cent, seven -> 7,
  one -> 1, ten -> 10), and "4 ,000" -> "4000". The sentences lost in the previous R-5 are
  present: "And in 10 years, Apple had grown from just the two of us in a garage into a $2
  billion company with over 4000 employees." and the "karma" sentence
  (05-en-refined-transcript.png, en-whisper-subtitles.vtt, en-refined-subtitles.vtt).
  The 12 digit words (17, 6, 7, 1, 10, 10, 20., 10, $2, 4000, 30., 30,) are zero-length word rows,
  spread over the whole transcript (47.5 s to 294.3 s), and the word rows are in time order.
  Observed: whisper's "4 ,000" became "4000" without the thousands comma (the previous R-5's
  partial run had produced "4,000").

  014: subtitles fetched from the subtitles.vtt endpoint the player loads, for every clip, and
  every two-line cue checked for a line break inside a number (014 step 3 rule).
  JA hrrAHpjsRvx4 whisper transcript: cue 107 (00:04:24.970 --> 00:04:27.670) is
  "だいたい" / "3.3キロくらいというふうに表示" (the previous R-5 had "だいたい3." / "3キロ...").
  The same clip after "Clean up with AI" (refined 22, aligned 22, rechunked 21; 1985 -> 1996
  chars): cue 107 (00:04:24.905 --> 00:04:27.789) is again "だいたい" / "3.3キロくらいというふうに
  表示"; cue 111 "3.3キロくらいになるみたいです。で、" is one line. 0 of 82 (whisper) and 0 of 79
  (refined) two-line cues break inside a number (ja-whisper-subtitles.vtt,
  ja-refined-subtitles.vtt, 06-ja-refined-transcript.png). AXvejOJ7dIe3: 0 of 91 two-line cues,
  16 of them hold digits (e.g. "用意したのは3月のIS" / "2071Aという型番。", which breaks after a
  letter, not a digit). EN before refine 0 of 117, after 0 of 119 ("billion company with" /
  "over 4000 employees."). Music clip 0 of 12.

  Restored afterwards: provider deepgram and transcript_refine routing local set in the UI,
  then the backed-up *-overrides.json copied back (cmp identical); the intelligence container
  recreated with its original environment (LLM_API_KEY_CLAUDE empty) and healthy. The test
  clips stay in videos/_r5_langdetect/, including the new silence130_then_ja.mp3; their
  transcripts are now whisper/refined test data.
pending: |
  Subtitle timing and the two-line layout as seen during playback (agent_cannot_verify:
  audio and video as heard and seen). The clips are audio-only, so the line layout was
  checked in the VTT the player loads, not on screen.
