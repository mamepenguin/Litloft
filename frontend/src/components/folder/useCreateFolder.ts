"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { createFolder } from "@/lib/api";

interface UseCreateFolderReturn {
  creatingFolder: boolean;
  newFolderName: string;
  folderError: string | null;
  setCreatingFolder: (v: boolean) => void;
  setNewFolderName: (v: string) => void;
  setFolderError: (v: string | null) => void;
  handleCreateFolder: () => Promise<void>;
}

export function useCreateFolder(
  driveName: string,
  folderPath: string | undefined,
  onComplete: () => void,
): UseCreateFolderReturn {
  const t = useTranslations("folder");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (name.includes("/") || name.includes("\\") || name === ".." || name === "." || name.startsWith(".")) {
      setFolderError(t("invalidName"));
      return;
    }
    if (name.length > 255) {
      setFolderError(t("nameTooLong"));
      return;
    }
    setFolderError(null);
    try {
      await createFolder(driveName, folderPath ?? "", name);
      setNewFolderName("");
      setCreatingFolder(false);
      onComplete();
    } catch {
      setFolderError(t("createFailed"));
    }
  }, [newFolderName, driveName, folderPath, onComplete, t]);

  return {
    creatingFolder, newFolderName, folderError,
    setCreatingFolder, setNewFolderName, setFolderError,
    handleCreateFolder,
  };
}
