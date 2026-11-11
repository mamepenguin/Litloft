import { vi } from "vitest";

/**
 * The API surface the upload screens touch. `children` of the layouts also
 * reach for the listing endpoints, so those are here as plain resolved
 * mocks rather than absent: an absent export throws where a screen renders.
 *
 * The mock functions are typed loosely on purpose: `vi.mock` replaces the
 * module, and a test that writes every response as the real type spends more
 * lines on shapes the queue never reads.
 */
export function apiMock() {
  return {
    initUpload: vi.fn().mockResolvedValue({ upload_id: "upload-1", chunk_size: 5, total_chunks: 1 }),
    uploadChunk: vi.fn().mockResolvedValue({}),
    completeUpload: vi.fn().mockResolvedValue({}),
    cancelUpload: vi.fn().mockResolvedValue(undefined),
    getFilesProcessing: vi.fn().mockResolvedValue({ files: {} }),
    lock: vi.fn().mockResolvedValue(undefined),
    getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } }),
    getFolders: vi.fn().mockResolvedValue([]),
    getPins: vi.fn().mockResolvedValue([]),
    getWatchHistory: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn(),
    scanDrive: vi.fn(),
    getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
    getDownloadUrl: () => "",
    getStreamUrl: () => "",
    addPin: vi.fn(),
    removePin: vi.fn(),
    deleteFile: vi.fn(),
    renameFile: vi.fn(),
    moveFile: vi.fn(),
  };
}

export type UploadApi = ReturnType<typeof apiMock>;

/** The mocked module, after `vi.mock("@/lib/api")` and any module reset. */
export async function mockedApi(): Promise<UploadApi> {
  return (await import("@/lib/api")) as unknown as UploadApi;
}
