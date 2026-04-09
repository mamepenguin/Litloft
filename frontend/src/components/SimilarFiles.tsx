"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getSimilarFiles } from "@/lib/api";
import type { SimilarFileItem, KeywordScore } from "@/lib/api";

interface SimilarFilesProps {
  fileId: string;
}

function matchTypeLabel(matchType: string): string {
  const labels: Record<string, string> = {
    clip: "visual",
    tfidf: "topic",
    "clip+tfidf": "visual+topic",
    whisper: "audio",
    text_content: "text",
    metadata: "metadata",
  };
  return labels[matchType] ?? matchType;
}

function ScoreBadge({ item }: { item: SimilarFileItem }) {
  const parts: string[] = [];
  if (item.primary_score != null) {
    parts.push(`V:${item.primary_score.toFixed(2)}`);
  }
  if (item.secondary_score != null) {
    parts.push(`T:${item.secondary_score.toFixed(2)}`);
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
      <span className="rounded bg-bg-elevated px-1 py-0.5">
        {matchTypeLabel(item.match_type)}
      </span>
      {parts.length > 0 && (
        <span className="tabular-nums">{parts.join(" ")}</span>
      )}
    </span>
  );
}

export function SimilarFiles({ fileId }: SimilarFilesProps) {
  const t = useTranslations("file");
  const [results, setResults] = useState<SimilarFileItem[]>([]);
  const [sourceKeywords, setSourceKeywords] = useState<KeywordScore[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResults([]);
    setSourceKeywords([]);
    setLoaded(false);
    setVisible(false);
  }, [fileId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fileId]);

  const fetchSimilar = useCallback(async () => {
    const data = await getSimilarFiles(fileId);
    if (data.available && data.results.length > 0) {
      setResults(data.results);
      setSourceKeywords(data.source_keywords ?? []);
    }
    setLoaded(true);
  }, [fileId]);

  useEffect(() => {
    if (visible && !loaded) {
      fetchSimilar();
    }
  }, [visible, loaded, fetchSimilar]);

  if (loaded && results.length === 0) {
    return <div ref={containerRef} />;
  }

  return (
    <div ref={containerRef} className="mt-6">
      {!loaded ? (
        <div className="h-32" />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-text-muted">
            {t("similarFiles")}
          </h2>
          {sourceKeywords.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {sourceKeywords.map((kw) => (
                <span
                  key={kw.word}
                  className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] text-text-muted"
                  title={`TF-IDF: ${kw.score?.toFixed(4)}`}
                >
                  {kw.word}
                  <span className="ml-0.5 opacity-50">
                    {kw.score?.toFixed(3)}
                  </span>
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {results.map((item) => (
              <Link
                key={item.file_id}
                href={`/files/${item.file_id}`}
                className="group overflow-hidden rounded-lg bg-bg-card transition-colors hover:bg-bg-elevated"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-bg-elevated">
                  <img
                    src={`/api/files/${item.file_id}/thumbnail`}
                    alt=""
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs text-text-primary">
                    {item.filename}
                  </p>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    <ScoreBadge item={item} />
                    {item.shared_keywords.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-0.5">
                        {item.shared_keywords.map((kw) => (
                          <span
                            key={kw.word}
                            className="rounded bg-bg-elevated px-1 py-px text-[9px] text-text-muted"
                            title={`src:${kw.source_tfidf?.toFixed(4)} tgt:${kw.target_tfidf?.toFixed(4)} rel:${kw.relevance?.toFixed(6)}`}
                          >
                            {kw.word}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
