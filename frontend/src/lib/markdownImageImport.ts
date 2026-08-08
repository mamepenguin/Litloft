import { fetchJSON } from "@/lib/api";

export interface MarkdownImageAnalysis {
  analysis_id: string;
  drive: string;
  folder_path: string;
  recursive: boolean;
  expires_at: string;
  counts: Record<string, number>;
  host_counts: Record<string, number>;
  samples: Array<{
    file_path: string;
    category: string;
    hostname?: string;
  }>;
}

export type MarkdownImageImportState =
  | "queued"
  | "running"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "interrupted"
  | "failed";

export interface MarkdownImageImportJob {
  job_id: string;
  analysis_id: string;
  drive: string;
  allowed_hosts: string[];
  state: MarkdownImageImportState;
  total: number;
  processed: number;
  succeeded: number;
  reused: number;
  skipped: number;
  conflicts: number;
  failed: number;
  current_file: string | null;
  recent_errors: Array<{
    file_path: string;
    code: string;
    detail: string;
  }>;
  results: Array<{
    file_id: string;
    file_path: string;
    source_hostname: string;
    imported_file_id: string;
    result: string;
  }>;
  started_at: string | null;
  finished_at: string | null;
}

const BASE = "/api/admin/markdown-images";

export function analyzeMarkdownImages(input: {
  drive: string;
  folder_path: string;
  recursive: boolean;
}): Promise<MarkdownImageAnalysis> {
  return fetchJSON(`${BASE}/analyses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function startMarkdownImageImport(
  analysisId: string,
  allowedHosts: string[],
): Promise<MarkdownImageImportJob> {
  return fetchJSON(`${BASE}/imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_id: analysisId, allowed_hosts: allowedHosts }),
  });
}

export function getCurrentMarkdownImageImport(): Promise<{
  job: MarkdownImageImportJob | null;
}> {
  return fetchJSON(`${BASE}/imports/current`);
}

export function getMarkdownImageImport(
  jobId: string,
): Promise<MarkdownImageImportJob> {
  return fetchJSON(`${BASE}/imports/${encodeURIComponent(jobId)}`);
}

export function cancelMarkdownImageImport(
  jobId: string,
): Promise<MarkdownImageImportJob> {
  return fetchJSON(`${BASE}/imports/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
}
