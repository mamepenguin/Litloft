"use client";

import { useCallback, useRef, useState } from "react";
import {
  searchCompare,
  type SearchSourceCounts,
  type SemanticSearchResult,
  type SemanticSearchSegment,
} from "@/lib/api";
import { formatDuration } from "@/lib/format";

function ResultCard({ result, rank }: { result: SemanticSearchResult; rank: number }) {
  const timestamps = result.segments
    .filter(
      (seg): seg is SemanticSearchSegment & { time_range: [number, number] } =>
        seg.time_range != null && seg.time_range[0] > 0,
    )
    .slice(0, 3);

  return (
    <a
      href={`/files/${result.file_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 rounded-lg border border-bg-border p-2 transition-colors hover:bg-bg-elevated"
    >
      <span className="flex-shrink-0 text-xs font-bold text-text-muted">
        #{rank}
      </span>
      <img
        src={`/api/files/${result.file_id}/thumbnail`}
        alt=""
        className="h-9 w-14 flex-shrink-0 rounded bg-bg-elevated object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-text-primary">
          {result.filename}
        </p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {result.match_types.map((type) => (
            <span
              key={type}
              className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent"
            >
              {type}
            </span>
          ))}
          <span className="text-[10px] text-text-muted">
            {result.score.toFixed(4)}
          </span>
        </div>
        {timestamps.length > 0 && (
          <div className="mt-0.5 flex gap-1">
            {timestamps.map((seg) => (
              <span
                key={seg.time_range[0]}
                className="text-[10px] text-accent"
              >
                {formatDuration(seg.time_range[0])}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function ResultColumn({
  title,
  results,
  total,
}: {
  title: string;
  results: SemanticSearchResult[];
  total: number;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
        <span className="text-xs text-text-muted">{total} results</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {results.map((r, i) => (
          <ResultCard key={r.file_id} result={r} rank={i + 1} />
        ))}
        {results.length === 0 && (
          <p className="py-4 text-center text-xs text-text-muted">
            No results
          </p>
        )}
      </div>
    </div>
  );
}

function DiffSummary({
  rrf,
  cosine,
}: {
  rrf: SemanticSearchResult[];
  cosine: SemanticSearchResult[];
}) {
  const rrfIds = rrf.map((r) => r.file_id);
  const cosineIds = cosine.map((r) => r.file_id);
  const rrfSet = new Set(rrfIds);
  const cosineSet = new Set(cosineIds);

  const shared = rrfIds.filter((id) => cosineSet.has(id));
  const rrfOnly = rrfIds.filter((id) => !cosineSet.has(id));
  const cosineOnly = cosineIds.filter((id) => !rrfSet.has(id));

  // Rank difference for shared results
  const rankDiffs = shared.map((id) => {
    const rrfRank = rrfIds.indexOf(id);
    const cosineRank = cosineIds.indexOf(id);
    return { id, rrfRank, cosineRank, diff: cosineRank - rrfRank };
  });
  const reordered = rankDiffs.filter((d) => d.diff !== 0);

  if (rrf.length === 0 && cosine.length === 0) return null;

  return (
    <div className="rounded-lg border border-bg-border bg-bg-secondary p-3 text-xs text-text-muted">
      <span className="font-medium text-text-primary">Diff: </span>
      shared {shared.length} /
      RRF only {rrfOnly.length} /
      Cosine only {cosineOnly.length}
      {reordered.length > 0 && (
        <span> / rank changed {reordered.length}</span>
      )}
    </div>
  );
}

function SourceCountsBar({ counts }: { counts: SearchSourceCounts | null }) {
  if (!counts) return null;

  const items = [
    { label: "Text Vector", count: counts.text_vector },
    { label: "CLIP", count: counts.clip_vector },
    { label: "Keyword", count: counts.keyword },
    { label: "Transcript KW", count: counts.transcript_keyword },
  ];

  const total = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className="rounded-lg border border-bg-border bg-bg-secondary p-3 text-xs">
      <span className="font-medium text-text-primary">
        Source hits (post-filter):
      </span>
      <span className="ml-2 text-text-muted">total {total}</span>
      <div className="mt-1.5 flex gap-3">
        {items.map((item) => (
          <span key={item.label} className="text-text-muted">
            {item.label}{" "}
            <span
              className={
                item.count > 0
                  ? "font-bold text-text-primary"
                  : "text-text-muted"
              }
            >
              {item.count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface CompareData {
  rrf: SemanticSearchResult[];
  cosine: SemanticSearchResult[];
  rrfNoCutoff: SemanticSearchResult[];
  cosineNoCutoff: SemanticSearchResult[];
  sourceCounts: SearchSourceCounts | null;
}

const EMPTY_DATA: CompareData = {
  rrf: [],
  cosine: [],
  rrfNoCutoff: [],
  cosineNoCutoff: [],
  sourceCounts: null,
};

export default function SearchComparePage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompareData>(EMPTY_DATA);
  const [searched, setSearched] = useState(false);
  const [showCutoff, setShowCutoff] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    try {
      const resp = await searchCompare(q, { limit: 30 });
      setData({
        rrf: resp.rrf?.results ?? [],
        cosine: resp.cosine?.results ?? [],
        rrfNoCutoff: resp.rrf_no_cutoff?.results ?? [],
        cosineNoCutoff: resp.cosine_no_cutoff?.results ?? [],
        sourceCounts: resp.source_counts ?? null,
      });
    } finally {
      setLoading(false);
    }
  }, [query]);

  const rrfResults = showCutoff ? data.rrf : data.rrfNoCutoff;
  const cosineResults = showCutoff ? data.cosine : data.cosineNoCutoff;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-lg font-bold text-text-primary">
        Search Algorithm Comparison
      </h1>
      <p className="mb-4 text-xs text-text-muted">
        RRF (Reciprocal Rank Fusion) vs Cosine Similarity scoring
      </p>

      <div className="mb-6 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search query..."
          className="flex-1 rounded-lg border border-bg-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "..." : "Search"}
        </button>
      </div>

      {searched && (
        <>
          <SourceCountsBar counts={data.sourceCounts} />
          <div className="mt-2 flex items-center gap-4">
            <DiffSummary rrf={rrfResults} cosine={cosineResults} />
            <label className="flex flex-shrink-0 items-center gap-1.5 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={showCutoff}
                onChange={(e) => setShowCutoff(e.target.checked)}
                className="accent-accent"
              />
              Score cutoff
              {!showCutoff && data.rrf.length !== data.rrfNoCutoff.length && (
                <span className="text-[10px] text-amber-400">
                  (cutoff: RRF {data.rrf.length}/{data.rrfNoCutoff.length}, Cos {data.cosine.length}/{data.cosineNoCutoff.length})
                </span>
              )}
            </label>
          </div>
          <div className="mt-4 flex gap-4">
            <ResultColumn title="RRF" results={rrfResults} total={rrfResults.length} />
            <ResultColumn
              title="Cosine Similarity"
              results={cosineResults}
              total={cosineResults.length}
            />
          </div>
        </>
      )}
    </div>
  );
}
