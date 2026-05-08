import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDrives,
  getFolders,
  getFolderTree,
  getDriveFiles,
  getFile,
  updateFile,
  likeFile,
  deleteFile,
  getStreamUrl,
  getDownloadUrl,
  getThumbnailUrl,
  renameFile,
  moveFile,
  createFolder,
  batchGetFiles,
  batchDelete,
  getPins,
  addPin,
  getPlaylists,
  getArchiveContents,
  getArchiveEntryUrl,
  unlock,
  getAuthStatus,
} from "../api";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, statusText = "Error") {
  return new Response(null, { status, statusText });
}

describe("api", () => {
  describe("getDrives", () => {
    it("fetches drives", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{ name: "main", protected: false }]));
      const result = await getDrives();
      expect(result).toEqual([{ name: "main", protected: false }]);
      expect(mockFetch).toHaveBeenCalledWith("/api/drives", expect.objectContaining({ credentials: "include" }));
    });

    it("throws on error", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, "Server Error"));
      await expect(getDrives()).rejects.toThrow("API error: 500 Server Error");
    });
  });

  describe("getFolders", () => {
    it("fetches folders without path", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await getFolders("main");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/drives/main/folders",
        expect.any(Object)
      );
    });

    it("fetches folders with path", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await getFolders("main", "photos");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/drives/main/folders?path=photos",
        expect.any(Object)
      );
    });
  });

  describe("getFolderTree", () => {
    it("fetches drive root with no params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await getFolderTree("main");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/drives/main/folder-tree",
        expect.any(Object)
      );
    });

    it("includes root, type_filter, depth", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await getFolderTree("main", { root: "photos", type_filter: "markdown", depth: 1 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("root=photos");
      expect(url).toContain("type_filter=markdown");
      expect(url).toContain("depth=1");
    });

    it("encodes drive name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await getFolderTree("my drive");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/drives/my%20drive/folder-tree",
        expect.any(Object)
      );
    });

    it("omits null type_filter", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await getFolderTree("main", { type_filter: null });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain("type_filter");
    });
  });

  describe("getDriveFiles", () => {
    it("builds query params correctly", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], meta: { total: 0, page: 1, limit: 30 } }));
      await getDriveFiles("main", { path: "", sort: "title", order: "asc", page: 2, limit: 30 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("path=");
      expect(url).toContain("sort=title");
      expect(url).toContain("order=asc");
      expect(url).toContain("page=2");
    });
  });

  describe("getFile", () => {
    it("fetches single file", async () => {
      const file = { id: "f1", filename: "test.mp4" };
      mockFetch.mockResolvedValueOnce(jsonResponse(file));
      const result = await getFile("f1");
      expect(result).toEqual(file);
    });
  });

  describe("updateFile", () => {
    it("sends PUT with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "f1" }));
      await updateFile("f1", { title: "New Title" });
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/files/f1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ title: "New Title" }),
        })
      );
    });
  });

  describe("likeFile", () => {
    it("sends POST", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "f1", likes: 1 }));
      await likeFile("f1");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/files/f1/like",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("deleteFile", () => {
    it("sends DELETE", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await deleteFile("f1");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/files/f1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("throws on error", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404));
      await expect(deleteFile("f1")).rejects.toThrow("API error: 404");
    });
  });

  describe("URL helpers", () => {
    it("getStreamUrl", () => {
      expect(getStreamUrl("f1")).toBe("/api/files/f1/stream");
    });

    it("getDownloadUrl", () => {
      expect(getDownloadUrl("f1")).toBe("/api/files/f1/stream?download=true");
    });

    it("getThumbnailUrl", () => {
      expect(getThumbnailUrl("f1")).toBe("/api/files/f1/thumbnail");
    });

    it("getArchiveEntryUrl", () => {
      expect(getArchiveEntryUrl("f1", "photos/img.jpg")).toBe(
        "/api/files/f1/archive/entry?path=photos%2Fimg.jpg"
      );
    });
  });

  describe("renameFile", () => {
    it("sends PUT with new filename", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "f1" }));
      await renameFile("f1", "new.mp4");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/files/f1/rename",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ new_filename: "new.mp4" }),
        })
      );
    });
  });

  describe("moveFile", () => {
    it("sends PUT with target path", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "f1" }));
      await moveFile("f1", "photos");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/files/f1/move",
        expect.objectContaining({
          body: JSON.stringify({ target_folder_path: "photos", target_drive: undefined }),
        })
      );
    });
  });

  describe("createFolder", () => {
    it("sends POST with path and name", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ name: "new", path: "new" }));
      await createFolder("main", "", "new");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/drives/main/folders",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "", name: "new" }),
        })
      );
    });
  });

  describe("batch operations", () => {
    it("batchGetFiles posts IDs", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await batchGetFiles(["f1", "f2"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/files/batch/get",
        expect.objectContaining({
          body: JSON.stringify({ ids: ["f1", "f2"] }),
        })
      );
    });

    it("batchDelete posts IDs", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ deleted: 2, errors: [] }));
      await batchDelete(["f1", "f2"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/files/batch/delete",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ ids: ["f1", "f2"] }),
        })
      );
    });
  });

  describe("pins", () => {
    it("getPins fetches pins", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{ path: "photos" }]));
      const result = await getPins("main");
      expect(result).toEqual([{ path: "photos" }]);
    });

    it("addPin posts path", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ path: "photos" }));
      await addPin("main", "photos");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/drives/main/pins",
        expect.objectContaining({
          body: JSON.stringify({ path: "photos" }),
        })
      );
    });
  });

  describe("playlists", () => {
    it("getPlaylists fetches list", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await getPlaylists("main");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/drives/main/playlists",
        expect.any(Object)
      );
    });
  });

  describe("archive", () => {
    it("getArchiveContents fetches entries", async () => {
      const data = { entries: [], total_entries: 0, total_size: 0 };
      mockFetch.mockResolvedValueOnce(jsonResponse(data));
      const result = await getArchiveContents("f1");
      expect(result).toEqual(data);
    });
  });

  describe("auth", () => {
    it("unlock sends password", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await unlock("secret", true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/unlock",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ password: "secret", remember: true }),
        })
      );
    });

    it("getAuthStatus fetches status", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ unlocked_groups: [], has_protected_drives: false }));
      const result = await getAuthStatus();
      expect(result).toEqual({ unlocked_groups: [], has_protected_drives: false });
    });
  });

  describe("credentials", () => {
    it("all fetchJSON calls include credentials", async () => {
      mockFetch.mockResolvedValue(jsonResponse([]));
      await getDrives();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: "include" })
      );
    });
  });
});
