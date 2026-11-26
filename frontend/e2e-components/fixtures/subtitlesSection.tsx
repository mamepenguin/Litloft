/**
 * The real Subtitles section at a phone's width, with two rows, so the
 * coarse-pointer hit areas and the absence of sideways scroll can be
 * measured where layout actually happens.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import SubtitlesSection from "@/components/FileDetail/SubtitlesSection";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import type { FileItem, SubtitleInfo } from "@/types";
import jaMessages from "@/messages-core/ja.json";

const subtitles: SubtitleInfo[] = [
  {
    index: 0,
    language: "ja",
    format: "srt",
    label: "",
    filename: "The Long Night.ja.srt",
    shared_with: 0,
    version: "1111111111111111111",
  },
  {
    index: 1,
    language: "en",
    format: "vtt",
    label: "",
    filename: "The Long Night.en.vtt",
    shared_with: 0,
    version: "2222222222222222222",
  },
];

const file = {
  id: "f1",
  drive: "main",
  folder_path: "",
  filename: "The Long Night.mp4",
  title: "The Long Night",
  description: "",
  file_type: "video",
  file_size: 1024,
  duration: 60,
  mime_type: "video/mp4",
  subtitles,
} as FileItem;

export function SubtitlesSectionPhoneArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <ShortcutsProvider>
        <div
          data-testid="subtitles-host"
          style={{ width: 375 }}
          className="bg-bg-primary p-4"
        >
          <SubtitlesSection file={file} onSubtitlesChange={() => {}} />
        </div>
      </ShortcutsProvider>
    </NextIntlClientProvider>
  );
}
