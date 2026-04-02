import type { UploadFileEntry } from "@/hooks/useUpload";

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const allEntries: FileSystemEntry[] = [];
  let batch = await readEntries(reader);
  while (batch.length > 0) {
    allEntries.push(...batch);
    batch = await readEntries(reader);
  }
  return allEntries;
}

export async function readDirectoryEntries(
  entry: FileSystemDirectoryEntry,
  basePath: string
): Promise<UploadFileEntry[]> {
  const reader = entry.createReader();
  const children = await readAllEntries(reader);
  const results: UploadFileEntry[] = [];

  for (const child of children) {
    if (child.isFile) {
      const file = await fileFromEntry(child as FileSystemFileEntry);
      results.push({ file, relativePath: `${basePath}/${file.name}` });
    } else if (child.isDirectory) {
      const nested = await readDirectoryEntries(
        child as FileSystemDirectoryEntry,
        `${basePath}/${child.name}`
      );
      results.push(...nested);
    }
  }

  return results;
}
