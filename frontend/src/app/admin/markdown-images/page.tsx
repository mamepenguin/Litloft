"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getDrives } from "@/lib/api";
import {
  analyzeMarkdownImages,
  cancelMarkdownImageImport,
  getCurrentMarkdownImageImport,
  getMarkdownImageImport,
  startMarkdownImageImport,
  type MarkdownImageAnalysis,
  type MarkdownImageImportJob,
} from "@/lib/markdownImageImport";
import type { Drive } from "@/types";
import { MarkdownImagesPresenter } from "./MarkdownImagesPresenter";

const POLLED_STATES = new Set(["queued", "running", "cancelling"]);

export default function MarkdownImagesPage() {
  const t = useTranslations("markdownImages");
  const [drives, setDrives] = useState<Drive[]>([]);
  const [drive, setDrive] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [recursive, setRecursive] = useState(true);
  const [analysis, setAnalysis] = useState<MarkdownImageAnalysis | null>(null);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<MarkdownImageImportJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDrives(), getCurrentMarkdownImageImport()])
      .then(([availableDrives, current]) => {
        setDrives(availableDrives);
        setDrive((value) => value || availableDrives[0]?.name || "");
        setJob(current.job);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : t("loadError"));
      });
  }, [t]);

  useEffect(() => {
    if (!job || !POLLED_STATES.has(job.state)) return;
    const timer = window.setTimeout(() => {
      getMarkdownImageImport(job.job_id)
        .then(setJob)
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : t("loadError"));
        });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [job, t]);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeMarkdownImages({
        drive,
        folder_path: folderPath,
        recursive,
      });
      setAnalysis(result);
      setSelectedHosts(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("analyzeError"));
    } finally {
      setLoading(false);
    }
  }, [drive, folderPath, recursive, t]);

  const startImport = useCallback(async () => {
    if (!analysis) return;
    setLoading(true);
    setError(null);
    try {
      const started = await startMarkdownImageImport(
        analysis.analysis_id,
        Array.from(selectedHosts),
      );
      setJob(started);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("importError"));
    } finally {
      setLoading(false);
    }
  }, [analysis, selectedHosts, t]);

  const cancel = useCallback(async () => {
    if (!job) return;
    try {
      setJob(await cancelMarkdownImageImport(job.job_id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("cancelError"));
    }
  }, [job, t]);

  const toggleHost = useCallback((host: string) => {
    setSelectedHosts((current) => {
      const next = new Set(current);
      if (next.has(host)) next.delete(host);
      else next.add(host);
      return next;
    });
  }, []);

  return (
    <MarkdownImagesPresenter
      drives={drives}
      drive={drive}
      folderPath={folderPath}
      recursive={recursive}
      analysis={analysis}
      selectedHosts={selectedHosts}
      job={job}
      loading={loading}
      error={error}
      onDriveChange={(value) => {
        setDrive(value);
        setFolderPath("");
        setAnalysis(null);
        setSelectedHosts(new Set());
      }}
      onFolderPathChange={setFolderPath}
      onRecursiveChange={setRecursive}
      onAnalyze={analyze}
      onHostToggle={toggleHost}
      onImport={startImport}
      onCancel={cancel}
    />
  );
}
