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

function video(overrides: Record<string, unknown> = {}, subtitles: SubtitleInfo[] = []): FileItem {
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
    ...overrides,
  } as FileItem;
}

function failure(status: number, code?: string, names: string[] = []) {
  return Object.assign(new ApiStatusError(status, `API error: ${status}`), { code, names });
}

function renderSection(file: FileItem, onSubtitlesChange = vi.fn()) {
  const utils = render(
    <ShortcutsProvider>
      <SubtitlesSection file={file} onSubtitlesChange={onSubtitlesChange} />
    </ShortcutsProvider>,
  );
  return { ...utils, onSubtitlesChange };
}

/** The label that names the section, not the add button or the empty line. */
function sectionLabel(container: HTMLElement): HTMLElement {
  const found = Array.from(container.querySelectorAll<HTMLElement>("*")).find((el) => {
    const own = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    return (
      own.startsWith("字幕") &&
      !own.startsWith("字幕を追加") &&
      !own.startsWith("字幕はありません")
    );
  });
  if (!found) throw new Error("no subtitles section label");
  return found;
}

function dialog(): HTMLElement {
  const found =
    screen.queryByRole("dialog") ??
    document.querySelector<HTMLElement>('[aria-modal="true"]');
  if (!found) throw new Error("no dialog");
  return found;
}

/**
 * The picker a named control owns. The input is often a hidden sibling of the
 * button, and the row and the add form each have their own.
 */
function fileInputNear(control: HTMLElement): HTMLInputElement {
  let node: HTMLElement | null = control;
  for (let depth = 0; depth < 5 && node; depth++) {
    const input = node.querySelector<HTMLInputElement>('input[type="file"]');
    if (input) return input;
    node = node.parentElement;
  }
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const last = all[all.length - 1];
  if (!last) throw new Error("no file input");
  return last;
}

function pick(control: HTMLElement, name: string) {
  const input = fileInputNear(control);
  fireEvent.change(input, {
    target: { files: [new File(["WEBVTT\n"], name, { type: "text/plain" })] },
  });
}

function openAddForm() {
  fireEvent.click(screen.getByRole("button", { name: "字幕を追加" }));
}

function selectLanguage(label: string) {
  const select = screen.getByRole("combobox") as HTMLSelectElement;
  const option = within(select).getByRole("option", { name: label }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
  return select;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SPEC-CORE-185 D1–D4: the Subtitles list", () => {
  it("D1 [SPEC-CORE-185] the section label carries the track count", () => {
    const { container } = renderSection(
      video({}, [
        sub({ index: 0, filename: "The Long Night.srt" }),
        sub({ index: 1, language: "ja", filename: "The Long Night.ja.srt" }),
        sub({ index: 2, language: "en", filename: "The Long Night.en.vtt" }),
      ]),
    );

    const label = sectionLabel(container);
    expect(label.textContent).toContain("字幕");
    expect(label.textContent).toContain("3");
  });

  it.each([
    ["ja", "日本語", "The Long Night.ja.srt"],
    ["", "既定", "The Long Night.srt"],
    ["xx", "XX", "The Long Night.xx.srt"],
  ])(
    "D2 [SPEC-CORE-185] a %s track shows its translated language and its file name",
    (language, label, filename) => {
      renderSection(video({}, [sub({ language, filename, label: "" })]));

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(filename)).toBeInTheDocument();
    },
  );

  it("D3 [SPEC-CORE-185] a row offers replace and delete, named after its language", () => {
    renderSection(video({}, [sub({ language: "ja", filename: "The Long Night.ja.srt" })]));

    expect(
      screen.getByRole("button", { name: "日本語の字幕を差し替え" }),
    ).toBeInTheDocument();
    const remove = screen.getByRole("button", { name: "日本語の字幕を削除" });
    expect(remove).toBeInTheDocument();
    expect(remove.className).toContain("text-danger");
  });

  it("D4 [SPEC-CORE-185] 字幕を追加 is a secondary button under the rows", () => {
    renderSection(video({}, [sub({ language: "ja", filename: "The Long Night.ja.srt" })]));

    const add = screen.getByRole("button", { name: "字幕を追加" });
    expect(add.className).toContain("bg-sand");
    expect(add.className).not.toContain("bg-accent");
  });

  it("the empty state says 字幕はありません and keeps the add button", () => {
    renderSection(video());

    expect(screen.getByText("字幕はありません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "字幕を追加" })).toBeInTheDocument();
  });

  it.each([
    [
      "a non-video file",
      { file_type: "document", mime_type: "text/markdown", filename: "note.md" },
    ],
    [
      "a .loft",
      {
        file_type: "video",
        mime_type: "application/vnd.litloft.loft+json",
        filename: "clip.loft",
      },
    ],
  ])("I20 [SPEC-CORE-185] draws no section for %s", (_kind, overrides) => {
    const { container } = renderSection(video(overrides));

    expect(container.innerHTML).toBe("");
  });
});

describe("SPEC-CORE-185 D5 / 185.2: the add form", () => {
  it("offers a file chooser, the 2-letter codes, 指定しない and その他のコード…", () => {
    const { container } = renderSection(video());

    openAddForm();

    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "選択…" })).toBeInTheDocument();
    expect(screen.getByText("言語")).toBeInTheDocument();

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(["ja", "en"]));
    expect(screen.getByRole("option", { name: "指定しない" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "その他のコード…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("shows the resulting file name for the chosen language", () => {
    renderSection(video());
    openAddForm();

    pick(screen.getByRole("button", { name: "選択…" }), "long_night_jp.srt");
    selectLanguage("日本語 (ja)");

    expect(screen.getByText("The Long Night.ja.srt")).toBeInTheDocument();
  });

  it("shows a bare name for 指定しない", () => {
    renderSection(video());
    openAddForm();

    pick(screen.getByRole("button", { name: "選択…" }), "long_night_jp.srt");
    selectLanguage("指定しない");

    expect(screen.getByText("The Long Night.srt")).toBeInTheDocument();
  });

  it("その他のコード… reveals a text field and lowercases the code for the file name", async () => {
    const added = [sub({ language: "fr", filename: "The Long Night.fr.srt" })];
    api.addSubtitle.mockResolvedValueOnce({ subtitles: added });
    renderSection(video());
    openAddForm();

    pick(screen.getByRole("button", { name: "選択…" }), "long_night_fr.srt");
    selectLanguage("その他のコード…");
    const code = screen.getByRole("textbox");
    fireEvent.change(code, { target: { value: "FR" } });

    expect(screen.getByText("The Long Night.fr.srt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() =>
      expect(api.addSubtitle).toHaveBeenCalledWith("f1", expect.any(File), "fr"),
    );
  });

  it("a successful add calls addSubtitle and hands the new list back", async () => {
    const added = [sub({ language: "ja", filename: "The Long Night.ja.srt" })];
    api.addSubtitle.mockResolvedValueOnce({ subtitles: added });
    const { onSubtitlesChange } = renderSection(video());
    openAddForm();

    pick(screen.getByRole("button", { name: "選択…" }), "long_night_jp.srt");
    selectLanguage("日本語 (ja)");
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() =>
      expect(api.addSubtitle).toHaveBeenCalledWith("f1", expect.any(File), "ja"),
    );
    expect(onSubtitlesChange).toHaveBeenCalledWith(added);
    await waitFor(() => expect(screen.queryByRole("button", { name: "追加" })).toBeNull());
  });

  it("キャンセル closes the form without calling the API", () => {
    renderSection(video());
    openAddForm();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
    expect(api.addSubtitle).not.toHaveBeenCalled();
  });

  it("keeps the chosen file and language after an error, and clears after a success", async () => {
    api.addSubtitle.mockRejectedValueOnce(failure(409, "subtitle_language_taken"));
    renderSection(video());
    openAddForm();

    pick(screen.getByRole("button", { name: "選択…" }), "long_night_jp.srt");
    const select = selectLanguage("日本語 (ja)");
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(
      await screen.findByText("この言語の字幕はすでにあります。差し替えを使ってください。"),
    ).toBeInTheDocument();
    expect(screen.getByText("The Long Night.ja.srt")).toBeInTheDocument();
    expect(select.value).toBe("ja");

    api.addSubtitle.mockResolvedValueOnce({ subtitles: [] });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => expect(api.addSubtitle).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: "追加" })).toBeNull());
  });
});

describe("SPEC-CORE-185 185.3: replace", () => {
  it("replaceSubtitle is called with the row's own file name", async () => {
    const after = [sub({ language: "ja", filename: "The Long Night.ja.vtt" })];
    api.replaceSubtitle.mockResolvedValueOnce({ subtitles: after, sidecar_errors: [] });
    const { onSubtitlesChange } = renderSection(
      video({}, [sub({ language: "ja", filename: "The Long Night.ja.srt" })]),
    );

    const replace = screen.getByRole("button", { name: "日本語の字幕を差し替え" });
    fireEvent.click(replace);
    pick(replace, "replacement.vtt");

    await waitFor(() =>
      expect(api.replaceSubtitle).toHaveBeenCalledWith(
        "f1",
        "The Long Night.ja.srt",
        expect.any(File),
      ),
    );
    expect(onSubtitlesChange).toHaveBeenCalledWith(after);
  });
});

describe("SPEC-CORE-185 D6 / I18: deleting a subtitle", () => {
  const trashed = [sub({ language: "ja", filename: "The Long Night.ja.srt" })];

  it("names the file and says it is removed from disk", () => {
    renderSection(video({}, trashed));

    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));

    const box = dialog();
    expect(within(box).getByText("字幕を削除しますか？")).toBeInTheDocument();
    expect(within(box).getByText("The Long Night.ja.srt")).toBeInTheDocument();
    expect(
      within(box).getByText("ディスクから削除します。元に戻せません。"),
    ).toBeInTheDocument();
  });

  it.each([
    [0, false],
    [1, true],
    [3, true],
  ])("shared_with=%i shows the shared line only when above 0 (%s)", (shared, shown) => {
    renderSection(video({}, [sub({ ...trashed[0], shared_with: shared })]));

    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));

    const box = dialog();
    const line = within(box).queryByText(/同じ名前の動画/);
    if (shown) {
      expect(line).not.toBeNull();
      expect(line!.textContent).toMatch(new RegExp(`同じ名前の動画\\s*${shared}\\s*本`));
    } else {
      expect(line).toBeNull();
    }
  });

  it("offers a danger 削除 alongside the secondary cancel", () => {
    renderSection(video({}, trashed));
    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));

    const box = dialog();
    const remove = within(box).getByRole("button", { name: "削除" });
    expect(remove.className).toContain("text-danger");
    expect(remove.className).not.toContain("bg-accent");
    expect(within(box).getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
  });

  it("confirm deletes exactly that name and hands the new list back", async () => {
    api.deleteSubtitle.mockResolvedValueOnce({ subtitles: [] });
    const { onSubtitlesChange } = renderSection(video({}, trashed));
    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));

    fireEvent.click(within(dialog()).getByRole("button", { name: "削除" }));

    await waitFor(() =>
      expect(api.deleteSubtitle).toHaveBeenCalledWith("f1", "The Long Night.ja.srt"),
    );
    expect(onSubtitlesChange).toHaveBeenCalledWith([]);
  });

  function backdrop(): HTMLElement {
    const el = document.querySelector<HTMLElement>(".bg-black\\/60");
    if (!el) throw new Error("backdrop not rendered");
    return el;
  }

  it.each([
    ["キャンセル", () => fireEvent.click(within(dialog()).getByRole("button", { name: "キャンセル" }))],
    ["the X", () => fireEvent.click(within(dialog()).getByRole("button", { name: "閉じる" }))],
    ["the backdrop", () => fireEvent.click(backdrop())],
    ["Escape", () => fireEvent.keyDown(document.body, { key: "Escape" })],
  ])("%s closes without deleting", (_path, dismiss) => {
    renderSection(video({}, trashed));
    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));

    dismiss();

    expect(api.deleteSubtitle).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-185 I19: one action at a time", () => {
  const twoTracks = [
    sub({ index: 0, language: "ja", filename: "The Long Night.ja.srt" }),
    sub({ index: 1, language: "en", filename: "The Long Night.en.srt" }),
  ];

  it("an add in flight disables the row controls and its own submit", async () => {
    let release: (value: unknown) => void = () => {};
    api.addSubtitle.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    renderSection(video({}, twoTracks));
    openAddForm();
    pick(screen.getByRole("button", { name: "選択…" }), "extra.srt");
    selectLanguage("日本語 (ja)");

    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "英語の字幕を差し替え" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "英語の字幕を削除" })).toBeDisabled();

    await act(async () => release({ subtitles: twoTracks }));
  });

  it("a replace in flight disables the add button and the other row", async () => {
    let release: (value: unknown) => void = () => {};
    api.replaceSubtitle.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    renderSection(video({}, twoTracks));

    const replace = screen.getByRole("button", { name: "日本語の字幕を差し替え" });
    fireEvent.click(replace);
    pick(replace, "replacement.srt");

    expect(screen.getByRole("button", { name: "字幕を追加" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "英語の字幕を差し替え" }),
    ).toBeDisabled();

    await act(async () => release({ subtitles: twoTracks, sidecar_errors: [] }));
  });

  it("a success arriving after the page moved to another file is discarded", async () => {
    let release: (value: unknown) => void = () => {};
    api.addSubtitle.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const { rerender, onSubtitlesChange } = renderSection(video({}, twoTracks));
    openAddForm();
    pick(screen.getByRole("button", { name: "選択…" }), "extra.srt");
    selectLanguage("日本語 (ja)");
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    rerender(
      <ShortcutsProvider>
        <SubtitlesSection
          file={video({ id: "f2", filename: "Another Night.mp4" })}
          onSubtitlesChange={onSubtitlesChange}
        />
      </ShortcutsProvider>,
    );

    await act(async () => release({ subtitles: [] }));

    expect(onSubtitlesChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an error arriving after the page moved to another file is not shown", async () => {
    let reject: (reason: unknown) => void = () => {};
    api.addSubtitle.mockImplementationOnce(
      () => new Promise((_resolve, fail) => (reject = fail)),
    );
    const { rerender } = renderSection(video({}, twoTracks));
    openAddForm();
    pick(screen.getByRole("button", { name: "選択…" }), "extra.srt");
    selectLanguage("日本語 (ja)");
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    rerender(
      <ShortcutsProvider>
        <SubtitlesSection
          file={video({ id: "f2", filename: "Another Night.mp4" })}
          onSubtitlesChange={vi.fn()}
        />
      </ShortcutsProvider>,
    );

    await act(async () => reject(failure(413, "subtitle_too_large")));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("字幕が 5 MB を超えています。")).toBeNull();
  });
});

describe("SPEC-CORE-185 185.8 / D7: refusals in the list", () => {
  it("a 409 shows the translated message and the names under a danger box", async () => {
    api.replaceSubtitle.mockRejectedValueOnce(
      failure(409, "subtitle_name_taken", ["The Long Night.ja.srt"]),
    );
    const { container } = renderSection(
      video({}, [sub({ language: "ja", filename: "The Long Night.ja.srt" })]),
    );

    const replace = screen.getByRole("button", { name: "日本語の字幕を差し替え" });
    fireEvent.click(replace);
    pick(replace, "replacement.srt");

    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("bg-danger/15");
    expect(alert.querySelector("svg")).not.toBeNull();
    expect(alert.textContent).toContain("行き先に同じ名前の字幕があります。");
    expect(alert.textContent).toContain("The Long Night.ja.srt");

    const list = container.querySelector("ul");
    if (list) {
      expect(
        list.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("a 404 on delete says the list was reloaded", async () => {
    api.deleteSubtitle.mockRejectedValueOnce(failure(404));
    renderSection(
      video({}, [sub({ language: "ja", filename: "The Long Night.ja.srt" })]),
    );
    fireEvent.click(screen.getByRole("button", { name: "日本語の字幕を削除" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "削除" }));

    expect(
      await screen.findByText("字幕の一覧が古くなっていたため読み直しました。"),
    ).toBeInTheDocument();
  });

  it("a 404 on replace says the list was reloaded", async () => {
    api.replaceSubtitle.mockRejectedValueOnce(failure(404));
    renderSection(
      video({}, [sub({ language: "ja", filename: "The Long Night.ja.srt" })]),
    );

    const replace = screen.getByRole("button", { name: "日本語の字幕を差し替え" });
    fireEvent.click(replace);
    pick(replace, "replacement.srt");

    expect(
      await screen.findByText("字幕の一覧が古くなっていたため読み直しました。"),
    ).toBeInTheDocument();
  });
});
