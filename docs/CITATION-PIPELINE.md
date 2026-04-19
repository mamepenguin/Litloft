# detailed_summary Citation Retrieval Pipeline

**Status**: shipped 2026-04-19
**Code**: `addons/intelligence/app/citations.py`
**Config**: `SummariesConfig` in `addons/intelligence/app/config.py`
**Docs**: high-level behaviour in `docs/INTELLIGENCE.md`; this document is the engineering reference.

## Why this document exists

The citation pipeline accumulated five layered mechanisms over a
week of iteration, each driven by a different observed failure mode.
Reading `citations.py` alone makes the **what** clear but the
**why** and **how they interact** is scattered across docstrings
and hako memories. This doc puts the whole architecture in one
place with diagrams, so a reader who opens the file next year knows
what each piece is doing and why it can't simply be deleted.

## What the pipeline does

Given a summary like:

```markdown
## 詳細内容
### 2. 塩もみキャベツ
- キャベツは洗って芯を切り落とし、葉と芯を分けて千切りにする。
- 塩を揉み込んで 15 分以上冷蔵庫に置き、水気をしっかり絞る。
```

and a transcript split into chunks 0..N, the pipeline answers, for
each bullet / paragraph / table row in the summary: *"which
transcript chunk(s) is this segment citing?"* The answer is stored
per segment in `detailed_summary_citations` and rendered in the UI
as the `🔗` / `⚠` badges you see under each summary line.

## Ten-second view

```
┌─────────────────────────────────────────────────────────────┐
│  compute_citations(file_id, detailed_summary)               │
└─────────────────────────────────────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌──────────────┐                            ┌───────────────────┐
│ Parse        │                            │ Fetch file's      │
│ segments &   │                            │ text embeddings   │
│ embed each   │                            │ (once per call)   │
└──────┬───────┘                            └─────────┬─────────┘
       │                                              │
       └──────────────────────┬───────────────────────┘
                              ▼
               ┌──────────────────────────┐
               │ Build section range map  │      ┌── DP (≥2 sibs)
               │  for each prefix         │──────┤
               │  (ancestor_headings)     │      └── Pool fallback (1 sib)
               └─────────────┬────────────┘
                             │   (prefix → chunk range)
                             ▼
               ┌──────────────────────────┐
               │ Per-segment retrieval    │
               │   dense (within range)   │
               │ + BM25 (within range)    │
               │ + RRF fusion             │
               └─────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Margin gate → has_citation│
                └─────────────┬────────────┘
                              ▼
             detailed_summary_citations rows
```

Two separate problems, two separate optimisations: **Section range
map** says where to look for each section; **per-segment
retrieval** picks the best chunk(s) from that window. The split is
what lets us keep each mechanism simple.

## Stage 1: Per-file vector fetch

**Problem it solves.** sqlite-vec's `MATCH` is a *global* KNN.
Filtering by `file_id` post-fetch means that once the DB contains
many files, the target file's chunks get buried behind other files'
near-matches in the global top-K — retrieval quality degrades with
scale, even when the target file hasn't changed.

**Fix.** `_fetch_file_vectors(file_id)` SELECTs the file's text
embeddings directly and we score them in numpy. Cost scales with
file-chunk count, not DB-vector count.

```
Before:  cos(query, chunks)   via global MATCH → file_id filter
         ─────────────────────────────────────────────────────
         k=200 is fine for a dev DB, useless when DB grows.

After:   cos(query, file_vectors) in numpy
         ─────────────────────────────────────────────────────
         O(file_chunks × dim) per call. Deterministic per file,
         independent of everyone else's embeddings.
```

## Stage 2: Section range map

This is where most of the clever work happens. The map answers:
*"for a segment whose ancestor_headings is P, which chunks should
its retrieval look at?"*

### The prefix / segment asymmetry

```
parse_segments()
  │
  ▼
┌───────────────────────────────────────────────────────────┐
│ Segment                                                   │
│   section_path    = "詳細内容/2"                          │
│   segment_text    = "塩を揉み込んで 15 分..."             │
│   ancestor_headings = ("詳細内容", "2. 塩もみキャベツ")   │
│   cells             = None  (bullets) / tuple (rows)      │
└───────────────────────────────────────────────────────────┘

Prefixes derived from ancestor_headings (every sub-tuple):
  ("詳細内容",)
  ("詳細内容", "2. 塩もみキャベツ")
```

- **Prefixes** are resolved independently against the full file:
  pooling their own segments' embeddings, finding the chunk range
  where that pool's content is discussed.
- **Segments** do *not* resolve independently. A segment looks up
  the range of its **deepest prefix** and retrieves within it.

Why the asymmetry?

- A prefix's pool = many segments' content averaged = strong topic
  vector. Self-sufficient.
- A single segment's vector = one short sentence = weak, noisy,
  easy to misplace. Needs the section's collective signal to scope it.

This is also why the earlier cascade (H2 range constrains H3
range) was removed: a structural parent like `## 詳細内容`
(container of unrelated recipes) doesn't have its own topic pool to
offer — each child stands on its own segments' pool. See
`_build_hierarchical_range_map` docstring for the historical detail.

### DP (when there are 2+ siblings)

For sibling groups — the children of the same parent prefix — the
map is built via **Viterbi monotonic alignment**. Each chunk is
assigned to exactly one sibling under the constraint:

```
┌────────────────────────────────────────────────────────┐
│  DP state                                              │
│    current section index k ∈ {0, 1, ..., K-1}          │
│                                                        │
│  Allowed transitions                                   │
│    stay    : k  → k                                    │
│    advance : k  → k+1                                  │
│    skip    : ✗  (forbidden)                            │
│    back    : ✗  (forbidden)                            │
│                                                        │
│  Initial                                               │
│    forced start at state 0 at chunk 0                  │
└────────────────────────────────────────────────────────┘
```

The summary is assumed to be **chronological** — sibling sections
appear in source order. DP finds the assignment that maximises
summed emission subject to "never go back, never skip a section".

Example: recipe video with 6 recipe H3 sections and 123 chunks.
Path after DP (conceptual):

```
  chunk  0   5   10  20  44  77  94  108 122
section 1   ─┐
section 2    └──────┐
section 3           └──────┘
section 4                  ├─────┘
section 5                        ├──────┘
section 6                               ├───
        ───▶ time
```

Each section's range is the `[min, max]` of its assigned chunks.
Because the path is monotonic, adjacent sections partition the
timeline with no back-tracking. Boundary margin (Stage 2b) then
widens each range by a couple of chunks so the transition sentence
at the seam is reachable from both sides.

### Discriminative emissions (what DP maximises)

Raw cosine can't tell sibling sections apart when the whole video
shares a topic. Example: a recipe video, section 2 "塩もみキャベツ"
pool vs chunk 107 (which is actually about 小松菜):

```
cos(chunk107, kyabetsu_pool)  = 0.90   ← high because "cooking"
cos(chunk107, komatsuna_pool) = 0.95   ← higher, it's actually about komatsuna
```

Using raw cosine alone, chunk 107 looks "kyabetsu-worthy" at 0.90.
But if we subtract the best sibling score, the picture flips:

```
disc(chunk107, kyabetsu) = 0.90 - 0.95 = -0.05   ← negative
disc(chunk107, komatsuna) = 0.95 - 0.90 = +0.05  ← positive
```

This is `citation_section_discriminative_enabled` and it's what the
DP uses for emissions. Chunks that match a sibling more than this
section drop below zero and never win a DP path through the "this
section" state.

### Single-sibling fallback (pool + clusters)

When a prefix has 0 or 1 siblings with usable pools, there's
nothing to align against. The code falls back to a simpler path:

1. Compute cosine of every chunk against the prefix's pool.
2. Filter to chunks above `citation_section_narrow_threshold` and
   with positive discriminative score.
3. Take top-M, sort by chunk_index, split into clusters when
   consecutive indices jump by more than `citation_section_cluster_gap`.
4. Keep the cluster with the highest total score; union a runner-up
   cluster whose weight is within `citation_section_cluster_union_ratio`.
5. Range = `[min, max]` of the kept cluster(s).

```
┌─ chunks sorted by index in top-M ─┐
│   0  1  3  4  8  20  27  40  42   │
└───────────────────────────────────┘
      gap>5        gap>5
──────────────────────────────────
cluster A: {0,1,3,4,8}  weight 4.6 ← winner
cluster B: {20,27}       weight 1.8
cluster C: {40,42}       weight 1.8

Range: min(A)..max(A) = (0, 8)
```

This path is what handled the simpler cases before DP shipped, and
still runs when a section has no siblings to align with.

### Boundary margin

Strict DP draws hard borders. A transition sentence — "さあ、次は
にんじんのサラダです" — can end up one chunk off the section it's
announcing. We expand each DP-assigned range by
`citation_section_boundary_margin` chunks on each side so adjacent
sections share their boundary chunks:

```
DP strict:   [─ sec1 ─][─ sec2 ─][─ sec3 ─]
                  chunks can only be in one range

With margin 2:    [── sec1 ──]
                       [── sec2 ──]
                             [── sec3 ──]
                       overlap here
```

The cost is a few more candidate chunks per segment, which the
per-segment retrieval still ranks cleanly.

## Stage 3: Per-segment retrieval (hybrid)

Given a segment and its section range, retrieve candidate chunks.

```
┌─────────────────────────────────────────────────────────┐
│ query = segment (embedding + salient tokens)            │
│ range = section_range (from Stage 2) or None            │
└──────────┬─────────────────────┬────────────────────────┘
           ▼                     ▼
    ┌────────────┐        ┌─────────────┐
    │ Dense top-N│        │ BM25 top-N  │
    │ (cos in    │        │ (FTS5 on    │
    │  range)    │        │  range)     │
    └─────┬──────┘        └──────┬──────┘
          │                      │
          └───────── RRF ────────┘
                     │
                     ▼
             top-K candidates
         (dense cosine as top_score)
```

**Dense side.** `_query_top_chunks_dense` restricted to
`section_range` (or full file when the range is None).

**BM25 side.** `_query_top_chunks_bm25` pulls salient tokens
(kanji runs, katakana, numbers with units, latin identifiers) from
the segment and queries FTS5 on the same range. Particularly
strong for numeric / proper-noun content that dense blurs.

**Fusion.** Reciprocal rank fusion with `citation_rrf_k = 60`.
Only chunks that appear in the dense candidate pool can win
(BM25-only candidates are discarded) — this keeps `top_score` =
dense cosine so the existing `citation_threshold` has the meaning
it always did.

**Table rows.** When a segment has `cells`, its embedding is the
max-pool of per-cell embeddings instead of a single embedding of
the joined row text. This prevents the header noun (`"保存期間 | 3
日"`'s 保存期間) from dominating and lets the value (`3 日`) find
its own chunk.

## Stage 4: Margin gate

Even with the above, the top pick is sometimes "only barely the
best" — multiple chunks score nearly identically. Rather than
point at one of them confidently, `compute_citations` demotes the
segment to `has_citation=False`:

```
top1 - top2 < citation_margin_gate   AND
top1       < citation_margin_bypass_score
    → flip to ⚠, clear chunk ids
```

Bypass: if top1 is already strong (≥ bypass), a close runner-up
just means the segment has multiple legitimate sources and we keep
the citation.

## End-to-end walkthrough

Consider segment *"と続き、リメイクの評価も回を重ねるごとに高まっていると述べている"*
(DQ commentary video).

1. **Parse.** `ancestor_headings = ("詳細内容", "1. 近年のドラクエリメイクの流れ")`,
   `segment_text = "と続き、..."`.

2. **Stage 1.** Fetch 56 file vectors.

3. **Stage 2a.** Pool each prefix. `("詳細内容",)` pool = average
   of all H3 siblings' segments. `("詳細内容", "1. 近年のドラクエリメイクの流れ")`
   pool = average of that section's bullets.

4. **Stage 2b.** DP over the 8 `("詳細内容", "n. ...")` siblings.
   Section 1's DP-assigned chunks come out as `[0, 1]`. Boundary
   margin 2 widens it to `(0, 3)`.

5. **Stage 3.** Retrieve within `(0, 3)`. Dense KNN over 4 chunks,
   BM25 over `fts_transcripts` with the range clause. Top-K:
   `[transcript:2, transcript:1, transcript:3]`. Dense cosine of
   `transcript:2` = 0.889 → `top_score`.

6. **Stage 4.** `top1 0.889 - top2 ≈ 0.85 = 0.04 ≥ margin_gate 0.05`
   fails — but `top1 ≥ margin_bypass 0.75` → bypass fires, keep
   `has_citation=True`.

7. **Write.** Row stored with chunks `["transcript:2", "transcript:1", "transcript:3"]`,
   `top_score=0.889`, `has_citation=true`.

Previously (before the DP layer) this segment cited chunk 41 — a
mid-video chunk about a different topic that happened to score high
on `("詳細内容", "1. 近年のドラクエリメイクの流れ")`'s pool
because the pool was a weak generic "DQ remakes" vector. DP
constrained the search to the opening minute where section 1 is
actually discussed, which is where chunk 2 lives.

## Decision matrix: which mechanism kicks in when

| Situation | Primary mechanism | Why |
|---|---|---|
| Summary has ≥ 2 siblings under the same parent | Viterbi DP | Monotonic + discriminative ranks chunks as "this section vs all the others" |
| Single-sibling parent (e.g. only one `## H2`) | pool + cluster detection | No DP opponents, nothing to align against |
| Prefix's pool fails the narrow threshold | `range = None` | Segments hanging off it fall back to full-file retrieval |
| Section with generic content (結論, まとめ) | depends on pool strength | Weak pool → None → full file; decent pool → DP puts it late in the timeline |
| Table rows | per-cell max-pool embed | Header noun doesn't dominate |
| Abstract bullet ("保存方法は冷蔵庫で") | margin gate demotes to ⚠ | Several chunks look equally plausible; refuse to pick one confidently |

## Config reference

These all live in `SummariesConfig`. Defaults are what you get if
`search-config.yml` says nothing about citations.

### Stage 1-2 (section range)

| Key | Default | Role |
|---|---|---|
| `citation_section_anchor_enabled` | `true` | Master switch for Stage 2. `false` = every segment searches the whole file. |
| `citation_section_narrow_threshold` | 0.5 | Pool-path: a chunk must clear this raw cosine to be kept. Also acts as the "section is anchorable at all" threshold. |
| `citation_section_range_top_m` | 12 | Pool-path: top-M cap before cluster detection. |
| `citation_section_cluster_gap` | 5 | Pool-path: consecutive top-M chunks more than this apart start a new cluster. |
| `citation_section_cluster_union_ratio` | 0.8 | Pool-path: runner-up cluster whose total weight is this fraction of the winner's gets unioned. |
| `citation_section_discriminative_enabled` | `true` | Subtract max-sibling cosine from each per-chunk emission. |
| `citation_section_disc_margin` | 0.01 | Minimum edge a chunk needs over its best-sibling cosine (pool-path only; DP uses raw disc scores throughout). |
| `citation_section_alignment_enabled` | `true` | DP master switch. `false` = pool + cluster detection always. |
| `citation_section_boundary_margin` | 2 | DP-assigned ranges get expanded by this many chunks on each side. |

### Stage 3 (per-segment retrieval)

| Key | Default | Role |
|---|---|---|
| `citation_hybrid_enabled` | `true` | BM25 rerank within the dense pool. |
| `citation_top_k_internal` | 10 | Dense pool size. |
| `citation_rrf_k` | 60 | RRF fusion constant. |
| `citation_top_k` | 3 | Candidates stored per segment. |
| `citation_threshold` | 0.55 | `top_score` floor for `has_citation=true`. |

### Stage 4 (margin gate)

| Key | Default | Role |
|---|---|---|
| `citation_margin_gate` | 0.05 | Demote to ⚠ when `top1 - top2` is below this. |
| `citation_margin_bypass_score` | 0.75 | Skip the gate entirely when `top1` is already this strong. |

## Troubleshooting

**All citations point at the same zone.**
Look at the section range map. If every prefix resolved to the
same narrow window, a structural parent may be dragging its
children. This shouldn't happen in the current code — cascade was
removed. If it does, check that `citation_section_anchor_enabled`
is on and that the segments have populated `ancestor_headings`.

**Specific segment cites a chunk far from its section.**
Dump the section's range (via `_build_hierarchical_range_map`).
If the range is wide (e.g. `(0, 53)`), DP either wasn't applied
(single-sibling parent) or the pool's content overlaps with the
whole video. Consider lowering `citation_section_disc_margin` or
tuning `citation_section_narrow_threshold` *upward* to force more
sections to map to `None`. Or, accept that cross-cutting sections
can't narrow — this is a documented limitation.

**Section's range is too tight and misses the real source by one chunk.**
Increase `citation_section_boundary_margin`. Default 2 trades off
tightness vs reach; try 3 if the 1-chunk-off pattern keeps recurring.

**A section ends up with `None` range even though its content is clearly present.**
The pool's top-1 cosine fell below `citation_section_narrow_threshold`.
Either the section's bullets are too abstract (no distinctive
content) or the threshold is too high. Lower
`citation_section_narrow_threshold` with caution — it also affects
which chunks survive the pool-path filter.

**Citation eval shows regression after a tune.**
Run `python -m app.evals_citations --baseline <prev.json>` to get
a per-segment-type breakdown.

## What's out of scope (known limitations)

- **Cross-cutting table rows.** A row summarising multiple time
  points has one `top_score` and one chunk-id list. Expressing
  "cell A matches chunk X, cell B matches chunk Y" needs a
  follow-up (DB shape + UI).
- **Non-monotonic summaries.** DP assumes the LLM writes the
  summary in source chronological order. LLMs mostly do; when they
  don't, turn off `citation_section_alignment_enabled` for that
  drive.
- **Headings beyond H3.** The parser tracks H2 + H3 only. H4+
  are flattened into paragraphs (intentional — prevents
  `section_path` churn).
