# Decisions

decision:
ran_in_app: yes
at: 6a6e24382ac6a5b6c9c6ab22461921bc7bd9652b
by: agent
evidence: |
  Local stack (OrbStack). The intelligence container's code matched addons/intelligence@75986fa (the
  commit HEAD pins); faster-whisper 1.1.0, model large-v3-turbo. Driven through headless Chromium
  (Playwright) at http://localhost:3000. Screenshots and VTT files are in r5/ next to this file.
  Setup: /admin/settings > Intelligence tab: Transcription provider set to "Whisper local" and saved,
  routing "AI transcript cleanup" set to claude (r5/04-...png), then the intelligence container
  restarted. The container had LLM_API_KEY_CLAUDE empty (the GUI shows "Not set" and the first
  refine got 401s), so for the refine runs it was recreated with the key from Keychain (with_secrets).
  Clips put in videos/_r5_langdetect/ and picked up with Library > More actions > Rescan:
  CnGV4Y6msVs_60-360s.mp3 (JA, file hrrAHpjsRvx4), qf4EIrP3_n8_60-360s.mp3 (JA, AXvejOJ7dIe3),
  jobs_stanford_60-360s.mp3 (EN, 300 s cut from the Stanford speech in the library, ucI7OXrk-1_r),
  music_then_ja.mp3 (40 s of instrumental music then 60 s of JA speech, PDzOXaOu4k-V),
  broken.mp3 (random bytes, v8Z4sz7a3Bnx).

  009 normal flow: the JA, JA and EN clips were each transcribed by whisper_local with no "Language
  detection failed" WARNING. All three come out punctuated (JA 。、 throughout, EN full sentences),
  shown in the Transcript tab (r5/07-ja-whisper-transcript.png). None of the words from the built-in
  ja/en prompts (市街地, 中心部, 歩道, 舗装, 工事, 通行, う回路, 案内 / downtown, sidewalk, paving,
  underway, detour, posted, signs) appears in any of the three transcripts.
  009 music opening: BUG. The spec's failure case expects a music opening to give probability <0.5,
  so None and no prompt. With music_then_ja.mp3 no low-confidence INFO was logged, and the JA speech
  came out as English text with the spaces lost ("ThisisthemaineventofPokemonGoFestTokyo.Let'scheck...",
  r5/10-music-led-ja-transcript.png). A diagnostic call in the container on the same file:
  model.detect_language on the decoded first 30 s (480000 samples) returns en 0.638, so
  _detect_language returns "en" and the English built-in prompt is applied to Japanese speech.
  A 35 s silent opening returns en 0.378 and then None, as the spec expects.
  009 decode failure: broken.mp3 logs exactly one WARNING "Language detection failed ... ffmpeg ...
  returned non-zero exit status 69". Transcription then runs and completes with 0 segments (no
  Transcript tab) rather than failing.

  011: transcription.whisper_local.initial_prompt set in search-config.yml to a prompt using
  full-width ，． (legacy indexing.whisper.initial_prompt left ""), then a restart and Index details >
  Regenerate on the whisper task (r5/11-...png). The new transcript uses ，． throughout, so the
  documented key reached the worker. The config was then restored and the clip regenerated with the
  built-in prompt. Its last chunk now ends in "ご視聴ありがとうございました。", which is not in the
  audio and is not prompt vocabulary.

  010: "Clean up with AI" on the Transcript tab, routed to the claude profile (claude-opus-5-5).
  The first refine runs failed after one window with sqlite3 "disk I/O error"; the cause was a
  host-side sqlite3 poll loop of mine reading search.db through the OrbStack mount. With it stopped,
  both full runs completed (refined 22/22, aligned 22/22).
  JA hrrAHpjsRvx4: digits that whisper already wrote are kept (3.3キロ, 44分, 4つ); もう一つ became
  もう1つ. After the aligner, the word rows are "3" "." "3" "キ" "ロ" and chunk 17 holds
  "...だいたい3.3キロくらいというふうに表示されました。" whole, so the chunk does not break at the decimal.
  Subtitle cue 107 (00:04:24.905 --> 00:04:27.789) does not end at the "." either, but the cue's
  two-line layout breaks the line inside the number: "だいたい3." / "3キロくらいというふうに表示". The
  same happens before refine with the whisper token rows "3." "3" (r5/ja-whisper-subtitles.vtt,
  r5/ja-refined-subtitles.vtt).
  JA AXvejOJ7dIe3 (refined in the I/O-error run, 20 of 22 chunks): digits kept (2025年, 1ヶ月,
  1週間, 5枚, 午前2時, 4人, 10倍, 50倍); the fixed words 一通り, 一変, 一切, 一度, 半日 and 数百キロ
  were kept, and so was もう一つ in "もう一つ良かったのが" (r5/20-ja-refined-transcript.png).
  EN ucI7OXrk-1_r: BUG. The partial run had stored the refined text of chunks 0-9 in full, with numbers
  converted (six months -> 6 months, five -cent -> 5-cent, seven miles -> 7 miles, one good meal ->
  1 good meal, one example -> 1 example, "a few months" unchanged). After the complete run, the
  transcript lost about two thirds of its text: 22 chunks / 4517 chars / 850 word rows became
  14 chunks / 1561 chars / 288 word rows. Each original chunk keeps roughly its first sentence, e.g.
  "We worked hard. And in 10 years, Apple had grown ... over 4,000 employees." and "Your gut,
  destiny, life, karma, whatever. ..." are gone, and the word "20." sits at 259.46-259.46, followed
  by nothing until the next kept sentence (r5/26-en-refined-complete-text-lost.png). The job logged
  no warning (refined 22, aligned 22, rechunked 14). The JA refine of the same build kept its text
  (21 chunks, 1997 chars against 1974 before). This EN file had been through two failed refine runs
  first, and the commits touch no aligner or refine code.

  Restored afterwards: transcription provider deepgram and routing transcript_refine local (set in
  the UI, then the backed-up override files copied back byte for byte), search-config.yml, and the
  intelligence container recreated with its original environment (LLM_API_KEY_CLAUDE empty). The
  test clips stay in videos/_r5_langdetect/ for a re-run; their transcripts are refined test data.
pending: |
  Kanji numerals in a Japanese transcript (as ElevenLabs Scribe writes them) turning into digits
  after refine: no succeeded Scribe transcript exists locally, and whisper already writes digits.
  Subtitle timing as seen during playback (agent_cannot_verify).
