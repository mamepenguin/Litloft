import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useFolderFiles } from "../useFolderFiles";
import type { SemanticHit } from "@/lib/searchMerge";

const mockGetDriveFiles = vi.fn();
const mockGetFolders = vi.fn();

vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getFolders: (...args: unknown[]) => mockGetFolders(...args),
}));

vi.mock("@/lib/recentlyPlayed", () => ({
  getRecentFileIds: () => [],
}));

const mockReadSearchCache = vi.fn();

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => mockReadSearchCache(...args),
  writeSearchCache: vi.fn(),
  searchCacheKey: (key: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${key.drive}::${key.query}::${key.type ?? "all"}::${key.includeSceneClip ? 1 : 0}`,
  clearSearchCache: vi.fn(),
}));

const mockFetchSemanticHits = vi.fn();
const mockIsSemanticSearchAvailable = vi.fn();

vi.mock("@/lib/semanticSearch", () => ({
  fetchSemanticHits: (...args: unknown[]) => mockFetchSemanticHits(...args),
  fetchSemanticImages: vi.fn(),
  isSemanticSearchAvailable: (...args: unknown[]) =>
    mockIsSemanticSearchAvailable(...args),
}));

interface Passage {
  kind: "utterance" | "scene" | "page" | "section" | "picture_text" | "text";
  start: number | null;
  end: number | null;
  page: number | null;
  section: number | null;
  section_title: string | null;
  chunk_index: number | null;
  text: string;
  score: number;
  keyword: boolean;
  highlight_terms: string[];
  frame_url: string | null;
}

function passage(overrides: Partial<Passage> = {}): Passage {
  return {
    kind: "utterance",
    start: 120,
    end: 150,
    page: null,
    section: null,
    section_title: null,
    chunk_index: 0,
    text: "the warehouse moved",
    score: 0.8,
    keyword: true,
    highlight_terms: ["warehouse"],
    frame_url: null,
    ...overrides,
  };
}

function hit(fileId: string, passages: Passage[] | undefined): SemanticHit {
  const base: SemanticHit = {
    file_id: fileId,
    drive: "main",
    filename: `${fileId}.mp4`,
    file_type: "video",
    score: 0.8,
    match_types: ["whisper"],
    segments: [],
    file: null,
  };
  return passages === undefined ? base : { ...base, passages };
}

function renderFiles(overrides: Record<string, unknown> = {}) {
  return renderHook(
    (props: Record<string, unknown>) =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "relevance",
        order: "desc",
        refreshKey: 0,
        searchQuery: "cats",
        ...props,
      }),
    { initialProps: overrides },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDriveFiles.mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, limit: 30 },
  });
  mockGetFolders.mockResolvedValue([]);
  mockReadSearchCache.mockReturnValue(null);
  mockFetchSemanticHits.mockResolvedValue({ ok: true, results: [] });
  mockIsSemanticSearchAvailable.mockResolvedValue(true);
});

describe("SPEC-CORE-040 I8 one meaning request feeds both views", () => {
  it("asks the meaning search for passages", async () => {
    const view = renderFiles();

    await waitFor(() => expect(mockFetchSemanticHits).toHaveBeenCalled());

    expect(mockFetchSemanticHits.mock.calls[0][2]).toMatchObject({ passages: true });
    view.unmount();
  });

  it("makes one request per query and type, and one more when the type changes", async () => {
    const view = renderFiles();

    await waitFor(() => expect(mockFetchSemanticHits).toHaveBeenCalledTimes(1));

    view.rerender({ typeFilter: "video" });
    await waitFor(() => expect(mockFetchSemanticHits).toHaveBeenCalledTimes(2));

    view.rerender({ typeFilter: "video" });
    expect(mockFetchSemanticHits).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});

describe("SPEC-CORE-040 I13 a failed meaning search is not an empty one", () => {
  it("reports a failure when the addon is unavailable", async () => {
    mockFetchSemanticHits.mockResolvedValue({ ok: false, results: [] });
    const view = renderFiles();

    await waitFor(() => expect(view.result.current.passagesFailed).toBe(true));

    expect(view.result.current.passagesLoading).toBe(false);
    expect(view.result.current.passageGroups).toEqual([]);
    view.unmount();
  });

  it("reports no failure for an answer with no passage", async () => {
    mockFetchSemanticHits.mockResolvedValue({
      ok: true,
      results: [hit("name-only", undefined)],
    });
    const view = renderFiles();

    await waitFor(() => expect(view.result.current.passagesLoading).toBe(false));

    expect(view.result.current.passagesFailed).toBe(false);
    expect(view.result.current.passageGroups).toEqual([]);
    view.unmount();
  });

  it("retries the meaning search and replaces the hits both views show", async () => {
    mockFetchSemanticHits.mockResolvedValue({ ok: false, results: [] });
    const view = renderFiles();
    await waitFor(() => expect(view.result.current.passagesFailed).toBe(true));

    let answer: ((value: unknown) => void) | null = null;
    mockFetchSemanticHits.mockImplementation(
      () => new Promise((resolve) => { answer = resolve; }),
    );

    act(() => view.result.current.retryPassages());
    await waitFor(() => expect(mockFetchSemanticHits).toHaveBeenCalledTimes(2));
    expect(view.result.current.passagesLoading).toBe(true);
    expect(view.result.current.passagesFailed).toBe(false);

    await act(async () => {
      answer!({ ok: true, results: [hit("retried", [passage()])] });
    });

    await waitFor(() => expect(view.result.current.passagesLoading).toBe(false));
    expect(view.result.current.passagesFailed).toBe(false);
    expect(view.result.current.passageGroups.map((g) => g.fileId)).toEqual(["retried"]);
    expect(view.result.current.files.map((f) => f.id)).toContain("retried");
    view.unmount();
  });
});

describe("SPEC-CORE-040 I19 the page's own answer, not the cache, feeds Passages", () => {
  it("stays loading on cache-seeded hits that carry no passages", async () => {
    mockReadSearchCache.mockReturnValue({
      filenameMatches: [],
      filenameTotal: 0,
      semanticHits: [hit("cached", undefined)],
      ts: Date.now(),
    });
    let answer: ((value: unknown) => void) | null = null;
    mockFetchSemanticHits.mockImplementation(
      () => new Promise((resolve) => { answer = resolve; }),
    );

    const view = renderFiles();

    await waitFor(() => expect(view.result.current.passagesLoading).toBe(true));
    expect(view.result.current.passageGroups).toEqual([]);

    await act(async () => {
      answer!({ ok: true, results: [hit("cached", [passage()])] });
    });

    await waitFor(() => expect(view.result.current.passagesLoading).toBe(false));
    expect(view.result.current.passageGroups.map((g) => g.fileId)).toEqual(["cached"]);
    view.unmount();
  });
});

describe("SPEC-CORE-040 I13 a changed query drops the previous answer first", () => {
  it("shows no group of the previous answer while the new request runs", async () => {
    mockFetchSemanticHits.mockResolvedValue({
      ok: true,
      results: [hit("old", [passage()])],
    });
    const view = renderFiles();

    await waitFor(() =>
      expect(view.result.current.passageGroups.map((g) => g.fileId)).toEqual(["old"]),
    );

    let answer: ((value: unknown) => void) | null = null;
    mockFetchSemanticHits.mockImplementation(
      () => new Promise((resolve) => { answer = resolve; }),
    );

    view.rerender({ searchQuery: "dogs" });

    await waitFor(() => expect(view.result.current.passagesLoading).toBe(true));
    expect(view.result.current.passageGroups).toEqual([]);

    await act(async () => {
      answer!({ ok: true, results: [hit("new", [passage()])] });
    });

    await waitFor(() =>
      expect(view.result.current.passageGroups.map((g) => g.fileId)).toEqual(["new"]),
    );
    view.unmount();
  });
});
