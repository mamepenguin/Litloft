# Decisions

decision:
ran_in_app: yes
at: 660d561cc0bf8c7dd89da321252da5e00dba0978
by: agent
evidence: |
  Third R-5 run (2026-11-15, after the per-frame label amendment), gemma4:e4b. Core worktree at
  660d561c with `addons/intelligence` at 93e6bf7a. Own stack: `r5_stack.py clone` then `up`
  (http://video-share-video-ask.localhost:3101); `llm.py`, `rag.py`, `prompt.py`,
  `file_question.py` and both `file_question_*.jinja2` in the intelligence container hash
  the same as the worktree. The clone's `llm-overrides.json` only gained a profile `gemma4`
  (ollama, `model` and `vision_model` `gemma4:e4b`, `offhost: false`) routed for
  `features.rag`. Its base_url was not the `local` one but a pass-through tap on the host
  (`r5/ollama_tap.py.txt`, host :11500 -> ollama :11434) that records each `/api/chat`
  request's messages, with every image replaced by the sha256 of its bytes; nothing was
  added to the worktree. `r5/tapsum.py.txt` matches each image to the `{ms}.large.webp`
  files in the frame cache. Every timing below went through the tap. `ollama ps` showed only
  gemma4:e4b before and after every run (no other model resident). Harness: the earlier
  `ask_harness-gemma.py.txt` through `r5/run-labels.sh.txt`; labelled contact sheets by
  `r5/contact_sheet.py.txt`. All requests use the routed profile (`profile: null`).

  Request layout (I11, I1), seen in the tap for every frames question (sse-31..38, 40, 42):
  ten messages, the system message, one user message with the prompt text, then eight user
  messages whose whole content is the label (`[11] 0:05` .. `[18] 1:07`, `[124] 1:26` ..
  `[131] 21:37`, `[1] 0:00` .. `[8] 0:20` for text-less videos) and whose `images` holds one
  image. Every image's bytes equal the cached `.large.webp` at the label's time, labels run
  in time order, and the `citations` seconds for each n are that file's time. The prompt
  text has no line pairing a frame number with a time (regex `\[\d+\].{0,5}\d+:\d\d`, 0 hits
  in every request), ends with "The frames follow the question, each introduced by its number
  and time.", and states the position as "The viewer is now at 0:36 in this file." when one
  was sent (sse-31). The system prompt reads "the numbered frames that follow the question".
  Two frames can carry the same label text (第35話 [15] and [16] are both `0:27`, 27.444 and
  27.653 s). The picture (sse-39) is unchanged: two messages, one image in the prompt message,
  "An image of the file is attached to this message", no label message, `image "attached"`.
  The YouTube `.loft` with no duration and no position (sse-41): two messages, no image,
  `meta {"partial": false, "image": "none"}`.

  Frame citations, judged against the labelled contact sheets (31, 33, 35, 36, 40). A
  mismatch is (a) the sentence fits another sent frame (pairing), (b) the cited frame is the
  right one but misread, (c) a frame selection artefact (SPEC-ADDON-112).
  Before (second run, sse-11/12/17/20, re-judged the same way against sheets 16, 17, 20):
  - Per-frame listing, 第17話 at 36.4 s (sse-20): 2/8 matched; 5 (a), 1 (b).
  - 第17話 sky question (sse-11): 0/3 ([14] daytime sky cited for constellations, (a)).
  - 第35話 order question (sse-12): 0/4 ([14] shows the man, cited for the shark three
    times (b); [15] is black (c)).
  - Recipe `.loft` (sse-17): 0/2 ([125] bag cited for the glass container, (a)).
  After (this run):
  - Per-frame listing, 第17話 at 36.4 s, three runs (sse-31 a/b/c): 8/8, 8/8, 8/8. Each
    description names what its own frame shows (キッズコーナー sign/floor, 星座コーナー shelf,
    black, shark against the sky, constellation, stars, shark constellation, stage with
    晴れの日でも); the shark is called "イルカのような" throughout.
  - Per-frame listing, 第35話 no position, two runs (sse-34 a/b): 8/8, 8/8; run b reads the
    ブラックコーヒー cup of [17] as ホットチョコレート (b).
  - 第17話 sky question, two runs (sse-32 a/b): 4/4 ([15] 36.37 s, [17] 58.43 s), 5/6 (the
    bullet on [16] 50.0 s adds constellation lines that frame does not have, (b)).
  - 第35話 order question, two runs (sse-33 a/b): 0/3 and 0/3, unchanged: both answers say
    the shark ordered black coffee and drank it and cite [14] 10.2 s, which shows the man
    drinking with a book (b); the shark drinking from the cup marked ブラックコーヒー is [17]
    39.5 s, never cited. Passage [1] has 「ブラックでいいんですよね」.
  - Recipe `.loft`, two runs (sse-35 a/b): 4/5 and 5/6; [124] (塩もみキャベツ title card,
    ingredients) and [125] (cabbage in a bag) are cited correctly; one bullet in each run
    says [125] shows the cabbage "in a bowl" (b, the bag).
  - Dense talking video 7yaTstDyaD--, `position_seconds` 0 (sse-40): 4/6 frame citations
    match (gown [111] [112], connecting the dots [112] calligraphy, love and loss [114] Apple
    office); "death" cites [114] (no frame shows it) and the gown also cites [113]
    (graduates in caps, not the speaker), both (b). Before (sse-13): 1/1.
  - Text-less videos: sample2 (sse-36, sse-37 a/b) and sample.mp4 (sse-38 a/b) are a single
    shot each (waterfall; trees and sky). Listings give 8/8 consistent descriptions; in
    sample2 the change to mossy rock with forest happens exactly at [6] 12.1 s in the frames
    and in both listings. They do not discriminate pairing much; no text-less video with
    varied shots exists in the data (the others are 0.1-10 s clips).
  No pairing (a) mismatch was seen in this run; the remaining mismatches are (b).

  Browser (Chrome 1372x895), 第17話 paused at 0:36, Ask tab, question 「子ザメたちが見上げて
  いる空はどんな様子ですか？」 (42 waiting state: the question with the Ask button disabled;
  43 answer about 20 s later, request at 19:30:55 local in the tap, eight label messages):
  the answer cites 0:36 and 0:58 for the constellation, 0:58 for the dotted-line figure,
  0:36 and 0:50 for the blue sky; all five match. Clicking the 0:58 pill: the player is
  paused at 58.433 s (video.currentTime) and shows the shark's face close-up, not the shark
  constellation of frame [17] (44). ffmpeg on the same stream (45: 56, 57, 58, 58.433, 59,
  60 s) gives the face at 58 s and the constellation at 58.433 s: 58.433 s is the first frame
  of the new shot (24000/1001 fps), and the browser at that currentTime shows the last frame
  of the previous shot; at 58.46 s the browser shows the constellation. So a pill on a frame
  taken at a cut seeks to the time the model saw but displays the previous shot.

  Timings (first `answer_chunk`; largest silence before it). Cold = frames prepared in the
  request; warm = frames already cached and the model loaded.
  - 第17話 at 36.4 s, cold (sse-31a): 14.18 s; 5.76 s. Warm: 1.32 s, 1.17 s.
  - 第17話 no position (sse-32a, one new frame 36370): 8.82 s; 5.26 s. Warm 1.27 s.
  - 第35話 cold (sse-33a): 9.97 s; 5.56 s. Warm 1.31 s.
  - Recipe `.loft`, frames through `/frame`, cold (sse-35a): 29.85 s; 9.44 s (keepalives at
    5.05 then 14.48 s: the request went out at about 9.4 s and the next keepalive came 5 s
    later). Warm 2.08 s.
  - Dense video at 0 (sse-40): 22.91 s; 6.00 s; `meta {"partial": true, "image":
    "attached"}`; frames 120.6 .. 801.4 s, none at 0.
  - sample2 (sse-36): 13.16 s; sample.mp4 (sse-38a): 13.33 s.
  - Picture (sse-39): 1.43 s, no keepalive. `.loft` without frames (sse-41): 5.36 s.
  Every frames answer ends with `meta {"partial": false, "image": "attached"}` except
  sse-40 (`partial: true`) and sse-41 (`image: "none"`). The intelligence log
  (`r5/intelligence-ask-labels.log`) has one `frames_dropped: chosen=8 dropped=0` line per
  frames question and no question or answer text.

  Earlier runs (same topic, previous commits): second run at 6dc4699d with bf242a7b, gemma4:e4b
  (sse-11..21, screenshots 11-21, `intelligence-ask-gemma.log`): everything per spec except
  frame citations naming the wrong frame. First run at the same commits with Qwen3.5 27B
  (sse-01..09, screenshots 01-07, `intelligence-ask.log`): frames requests timed out at 90 s;
  with a 400 s profile the frames path, pill seek, refusal notice (06), text-only profile,
  `.loft` and disconnect checks passed.
pending: |
  Off-host profiles (the `claude` profile, an external LLM API) were not used: external
  services are under agent_cannot_verify, so the OpenAI-compatible layout of I11 (label text
  parts alternating with `image_url` parts) was not observed in the app. The refusal path, a
  profile that cannot see and the "no frame could be prepared" case were not re-run after the
  amendment (the first two are the first run's sse-05, sse-06 and screenshot 06).
