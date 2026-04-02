import { describe, it, expect, vi } from "vitest";
import { readDirectoryEntries } from "../directoryReader";

function createMockFileEntry(name: string): FileSystemFileEntry {
  const mockFile = new File(["content"], name, { type: "text/plain" });
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: `/${name}`,
    filesystem: {} as FileSystem,
    getParent: vi.fn(),
    file: (cb: (file: File) => void) => cb(mockFile),
  } as unknown as FileSystemFileEntry;
}

function createMockDirectoryEntry(
  name: string,
  children: FileSystemEntry[]
): FileSystemDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    filesystem: {} as FileSystem,
    getParent: vi.fn(),
    createReader: () => {
      let read = false;
      return {
        readEntries: (
          cb: (entries: FileSystemEntry[]) => void,
        ) => {
          if (!read) {
            read = true;
            cb(children);
          } else {
            cb([]);
          }
        },
      } as unknown as FileSystemDirectoryReader;
    },
  } as unknown as FileSystemDirectoryEntry;
}

describe("readDirectoryEntries", () => {
  it("reads flat files from a directory", async () => {
    const dir = createMockDirectoryEntry("photos", [
      createMockFileEntry("a.jpg"),
      createMockFileEntry("b.png"),
    ]);

    const entries = await readDirectoryEntries(dir, "photos");
    expect(entries).toHaveLength(2);
    expect(entries[0].relativePath).toBe("photos/a.jpg");
    expect(entries[0].file.name).toBe("a.jpg");
    expect(entries[1].relativePath).toBe("photos/b.png");
  });

  it("reads nested directories recursively", async () => {
    const subDir = createMockDirectoryEntry("sub", [
      createMockFileEntry("deep.txt"),
    ]);

    const dir = createMockDirectoryEntry("root", [
      createMockFileEntry("top.txt"),
      subDir,
    ]);

    const entries = await readDirectoryEntries(dir, "root");
    expect(entries).toHaveLength(2);
    expect(entries[0].relativePath).toBe("root/top.txt");
    expect(entries[1].relativePath).toBe("root/sub/deep.txt");
  });

  it("returns empty array for empty directory", async () => {
    const dir = createMockDirectoryEntry("empty", []);
    const entries = await readDirectoryEntries(dir, "empty");
    expect(entries).toHaveLength(0);
  });

  it("handles deeply nested structure", async () => {
    const level2 = createMockDirectoryEntry("c", [
      createMockFileEntry("file.txt"),
    ]);
    const level1 = createMockDirectoryEntry("b", [level2]);
    const root = createMockDirectoryEntry("a", [level1]);

    const entries = await readDirectoryEntries(root, "a");
    expect(entries).toHaveLength(1);
    expect(entries[0].relativePath).toBe("a/b/c/file.txt");
  });
});
