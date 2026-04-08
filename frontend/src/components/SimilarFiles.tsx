"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getSimilarFiles } from "@/lib/api";
import type { SimilarFileItem } from "@/lib/api";

interface SimilarFilesProps {
  fileId: string;
}

export function SimilarFiles({ fileId }: SimilarFilesProps) {
  const t = useTranslations("file");
  const [results, setResults] = useState<SimilarFileItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResults([]);
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
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
