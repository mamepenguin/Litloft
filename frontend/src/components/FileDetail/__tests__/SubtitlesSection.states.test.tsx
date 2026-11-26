import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

import type { FileItem, SubtitleInfo } from "@/types";
import { ApiStatusError } from "@/lib/apiError";
import SubtitlesSection from "../SubtitlesSection";
import { ShortcutsProvider } from "../../ShortcutsProvider";

const api = vi.hoisted(() => ({
  addSubtitle: vi.fn(),
  replaceSubtitle: vi.fn(),
  deleteSubtitle: vi.fn(),
  getFile: vi.fn(),
}));

vi.mock("@/lib/api", async () => ({
  ...api,
  ApiStatusError: (await import("@/lib/apiError")).ApiStatusError,
}));

vi.mock("next-intl", async () => {
  const messages = (await import("@/messages-core/ja.json")).default as Record<string, unknown>;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
  return {
    useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const path = namespace === undefined ? key : `${namespace}.${key}`;
      const raw = lookup(path);
      let text = typeof raw === "string" ? raw : path;
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    },
    useLocale: () => "ja",
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
  };
});

function sub(overrides: Record<string, unknown> = {}): SubtitleInfo {
  return {
    index: 0,
    language: "",
    format: "srt",
    label: "",
    filename: "The Long Night.srt",
    shared_with: 0,
    version: "1111111111111111111",
    ...overrides,
  } as SubtitleInfo;
}

function video(subtitles: SubtitleInfo[]): FileItem {
  return {
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
}

function renderSection(subtitles: SubtitleInfo[], onSubtitlesChange = vi.fn()) {
  const utils = render(
    <ShortcutsProvider>
      <SubtitlesSection
        file={video(subtitles)}
        onSubtitlesChange={onSubtitlesChange}
      />
    </ShortcutsProvider>,
  );
  return { ...utils, onSubtitlesChange };
}

function dialog(): HTMLElement {
  const found =
    screen.queryByRole("dialog") ??
    document.querySelector<HTMLElement>('[aria-modal="true"]');
  if (!found) throw new Error("no dialog");
  return found;
}

const twoTracks = [
  sub({ index: 0, language: "ja", filename: "The Long Night.ja.srt" }),
  sub({ index: 1, language: "en", filename: "The Long Night.en.srt" }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SPEC-CORE-185 I19 / 185.8: the states the list decides on", () => {
  it("a delete in flight disables the add button and the other row", async () => {
    let release: (value: unknown) => void = () => {};
    api.deleteSubtitle.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    renderSection(twoTracks);

    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "削除" }));

    expect(screen.getByRole("button", { name: "字幕を追加" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "英語の字幕を差し替え" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "英語の字幕を削除" })).toBeDisabled();

    await act(async () => release({ subtitles: [twoTracks[1]] }));
  });

  it("replaces the rows when the page hands back a refetched list", () => {
    const { rerender } = renderSection(twoTracks);

    rerender(
      <ShortcutsProvider>
        <SubtitlesSection
          file={video([sub({ language: "fr", filename: "The Long Night.fr.vtt" })])}
          onSubtitlesChange={vi.fn()}
        />
      </ShortcutsProvider>,
    );

    expect(screen.getByText("フランス語")).toBeInTheDocument();
    expect(screen.getByText("The Long Night.fr.vtt")).toBeInTheDocument();
    expect(screen.queryByText("The Long Night.ja.srt")).toBeNull();
  });

  it("a 404 reloads the detail and hands its list back", async () => {
    const fresh = [sub({ language: "fr", filename: "The Long Night.fr.srt" })];
    api.deleteSubtitle.mockRejectedValueOnce(
      Object.assign(new ApiStatusError(404, "API error: 404 Not Found")),
    );
    api.getFile.mockResolvedValueOnce(video(fresh));
    const { onSubtitlesChange } = renderSection([
      sub({ language: "ja", filename: "The Long Night.ja.srt" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "削除" }));

    expect(
      await screen.findByText("字幕の一覧が古くなっていたため読み直しました。"),
    ).toBeInTheDocument();
    await waitFor(() => expect(onSubtitlesChange).toHaveBeenCalledWith(fresh));
  });
});
