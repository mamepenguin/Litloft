import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";

import { FilePreview } from "@/components/FilePreview";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import enMessages from "@/messages-core/en.json";
import type { FileItem } from "@/types";
import "../../e2e-layout/fixtures/globals.built.css";

declare global {
  interface Window {
    setSection: (section: number | undefined) => void;
  }
}

const params = new URLSearchParams(location.search);
const bookId = params.get("book") ?? "";
const s = params.get("s");

const FILE: FileItem = {
  id: bookId,
  filename: `${bookId}.epub`,
  title: bookId,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "document",
  mime_type: "application/epub+zip",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: null,
  image_width: null,
  image_height: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function App() {
  const [section, setSection] = useState<number | undefined>(s === null ? undefined : Number(s));
  useEffect(() => {
    window.setSection = setSection;
  }, []);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutsProvider>
        <FilePreview file={FILE} initialSection={section} />
      </ShortcutsProvider>
    </NextIntlClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
