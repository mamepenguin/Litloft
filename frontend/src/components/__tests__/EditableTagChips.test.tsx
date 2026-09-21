import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EditableTagChips } from "@/components/EditableTagChips";
import { COMPOSITION_GRACE_MS } from "@/lib/ime";

const file = {
  id: "fVid0000001A",
  mime_type: "video/mp4",
  filename: "clip.mp4",
  drive: "media",
  folder_path: "clips",
};

vi.mock("@/lib/api", () => ({
  getDriveTags: vi.fn(),
  updateFileTags: vi.fn(),
}));

import { getDriveTags, updateFileTags } from "@/lib/api";

function clickAdd() {
  fireEvent.click(screen.getByRole("button", { name: /Add tag/ }));
}

function typeAndEnter(text: string) {
  const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDriveTags).mockResolvedValue([
    { name: "cooking", count: 2 },
    { name: "travel", count: 1 },
  ]);
  vi.mocked(updateFileTags).mockResolvedValue({
    id: "fVid0000001A",
    tags: ["x"],
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EditableTagChips IME composition", () => {
  function confirmConversion(input: HTMLInputElement, text: string) {
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: text } });
    fireEvent.compositionEnd(input, { data: text });
  }

  it("does not add a tag on the Enter that confirms a conversion", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const onChange = vi.fn();
    render(<EditableTagChips file={file} initialTags={[]} onTagsChange={onChange} />);
    clickAdd();
    const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
    confirmConversion(input, "料理");
    now.mockReturnValue(1_000_000 + COMPOSITION_GRACE_MS - 1);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Remove 料理")).not.toBeInTheDocument();
    expect(input.value).toBe("料理");
  });

  it("adds the tag once on an Enter pressed after the grace window", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const onChange = vi.fn();
    render(<EditableTagChips file={file} initialTags={[]} onTagsChange={onChange} />);
    clickAdd();
    const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
    confirmConversion(input, "料理");
    now.mockReturnValue(1_000_000 + COMPOSITION_GRACE_MS);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    await waitFor(() => expect(screen.getByLabelText("Remove 料理")).toBeInTheDocument());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("EditableTagChips", () => {
  it("renders initial tags with remove buttons", () => {
    render(<EditableTagChips file={file} initialTags={["foo", "bar"]} />);
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove foo")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove bar")).toBeInTheDocument();
  });

  it("adds a valid tag and calls onTagsChange", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={[]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    typeAndEnter("newtag");

    await waitFor(() => {
      expect(screen.getByText("newtag")).toBeInTheDocument();
    });
    expect(onChange).toHaveBeenLastCalledWith(["newtag"]);
  });

  it("closes the field once the tag is accepted", async () => {
    // Asserted on both pieces of state `closeInput` owns: the field going
    // away is `adding` and the text going away is `input`.
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    typeAndEnter("newtag");

    await waitFor(() => {
      expect(screen.getByText("newtag")).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText("Tag name...")).not.toBeInTheDocument();

    clickAdd();
    expect(
      (screen.getByPlaceholderText("Tag name...") as HTMLInputElement).value,
    ).toBe("");
  });

  it("rejects invalid characters with an inline error", async () => {
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    typeAndEnter("bad name");

    await waitFor(() => {
      expect(screen.getByText(/Contains invalid characters/)).toBeInTheDocument();
    });
  });

  it("clears the error when the tag is one already present", async () => {
    // The error paragraph renders outside the `adding` branch, so closing
    // the field does not by itself take a stale error off the screen.
    render(<EditableTagChips file={file} initialTags={["existing"]} />);
    clickAdd();
    typeAndEnter("bad name");
    await waitFor(() => {
      expect(screen.getByText(/Contains invalid characters/)).toBeInTheDocument();
    });

    typeAndEnter("existing");

    await waitFor(() => {
      expect(
        screen.queryByText(/Contains invalid characters/),
      ).not.toBeInTheDocument();
    });
  });

  it("clears the error when the field is dismissed", async () => {
    // The same single exit, reached from Escape rather than from a
    // successful submit.
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    typeAndEnter("bad name");
    await waitFor(() => {
      expect(screen.getByText(/Contains invalid characters/)).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByPlaceholderText(/tag/i), { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByText(/Contains invalid characters/),
      ).not.toBeInTheDocument();
    });
  });

  it("rejects over-length tags", async () => {
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    typeAndEnter("x".repeat(31));

    await waitFor(() => {
      expect(screen.getByText(/30 characters/)).toBeInTheDocument();
    });
  });

  it("rejects the 11th tag with maxCount", async () => {
    const seed = Array.from({ length: 10 }, (_, i) => `t${i}`);
    render(<EditableTagChips file={file} initialTags={seed} />);
    clickAdd();
    typeAndEnter("overflow");

    await waitFor(() => {
      expect(screen.getByText(/Maximum 10/)).toBeInTheDocument();
    });
  });

  it("removes a tag when its × button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={["keep", "drop"]}
        onTagsChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove drop"));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(["keep"]);
    });
    expect(screen.queryByText("drop")).toBeNull();
  });

  it("skips duplicates case-insensitively", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={["Cooking"]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    typeAndEnter("COOKING");

    // Brief flush — the submitTag path returns early without onChange.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Tag name...")).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Backspace on empty input removes the last chip", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={["a", "b"]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    const input = screen.getByPlaceholderText("Tag name...");
    fireEvent.keyDown(input, { key: "Backspace" });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(["a"]);
    });
  });

  it("Escape closes the input without committing", () => {
    render(<EditableTagChips file={file} initialTags={[]} />);
    clickAdd();
    const input = screen.getByPlaceholderText("Tag name...");
    fireEvent.change(input, { target: { value: "typed" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText("Tag name...")).toBeNull();
    expect(screen.queryByText("typed")).toBeNull();
  });

  it("accepts Unicode (CJK) tag names", async () => {
    const onChange = vi.fn();
    render(
      <EditableTagChips
        file={file}
        initialTags={[]}
        onTagsChange={onChange}
      />,
    );
    clickAdd();
    typeAndEnter("日本語");

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(["日本語"]);
    });
  });

  describe("save-cancel regression (2026-04-24 bug)", () => {
    it("debounced save still fires after parent passes a new onTagsChange ref", async () => {
      // The optimistic onTagsChange re-renders the parent with a fresh
      // lambda. If the saver re-creates on that, its cleanup cancels the
      // pending timer and the save is dropped.
      function Harness() {
        const [rerenderKey, setRerenderKey] = useState(0);
        return (
          <EditableTagChips
            file={file}
            initialTags={[]}
            // Fresh lambda ref every render — simulates parent's
            // setState-triggered re-render handing us new refs.
            onTagsChange={() => {
              setRerenderKey((k) => k + 1);
            }}
            onSaveSuccess={() => {
              void rerenderKey;
            }}
          />
        );
      }

      render(<Harness />);
      fireEvent.click(screen.getByRole("button", { name: /Add tag/ }));
      const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "typed" } });
      fireEvent.keyDown(input, { key: "Enter" });

      // saveFileTags routes to updateFileTags (mocked). Wait for the
      // 2s debounce to flush; if the saver was cancelled by a parent
      // re-render, updateFileTags never gets called and this times
      // out.
      await waitFor(
        () => {
          expect(updateFileTags).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );
      expect(updateFileTags).toHaveBeenLastCalledWith(file.id, ["typed"]);
    }, 10000);
  });

  describe("content mode", () => {
    it("seeds tags from frontmatter when in content mode", () => {
      const content = "---\ntags:\n  - a\n  - b\n---\nbody\n";
      render(
        <EditableTagChips
          file={file}
          content={content}
          onContentChange={vi.fn()}
        />,
      );
      expect(screen.getByText("a")).toBeInTheDocument();
      expect(screen.getByText("b")).toBeInTheDocument();
    });

    it("adds a tag by rewriting source via onContentChange", async () => {
      const onContentChange = vi.fn();
      const content = "---\ntags: [a]\n---\nbody\n";
      render(
        <EditableTagChips
          file={file}
          content={content}
          onContentChange={onContentChange}
        />,
      );
      clickAdd();
      typeAndEnter("b");

      await waitFor(() => {
        expect(onContentChange).toHaveBeenCalled();
      });
      const next = onContentChange.mock.calls[onContentChange.mock.calls.length - 1][0];
      expect(next).toContain("tags:");
      expect(next).toContain("a");
      expect(next).toContain("b");
      expect(next).toContain("body");
    });

    it("removes a tag by rewriting source via onContentChange", async () => {
      const onContentChange = vi.fn();
      const content = "---\ntags:\n  - keep\n  - drop\n---\nbody\n";
      render(
        <EditableTagChips
          file={file}
          content={content}
          onContentChange={onContentChange}
        />,
      );
      fireEvent.click(screen.getByLabelText("Remove drop"));

      await waitFor(() => {
        expect(onContentChange).toHaveBeenCalled();
      });
      const next = onContentChange.mock.calls[onContentChange.mock.calls.length - 1][0];
      expect(next).toContain("keep");
      expect(next).not.toContain("drop");
    });

    it("NEVER triggers a network save in content mode", async () => {
      const onContentChange = vi.fn();
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      render(
        <EditableTagChips
          file={file}
          content="---\ntags: [a]\n---\nbody\n"
          onContentChange={onContentChange}
        />,
      );
      clickAdd();
      typeAndEnter("b");
      await waitFor(() => expect(onContentChange).toHaveBeenCalled());

      // getDriveTags is mocked at module level so never hits fetch.
      // The only possible fetch would be from a debounced save path
      // (stream + content PUT) — content mode must not do any of
      // those.
      const saveCalls = fetchSpy.mock.calls.filter(([url, init]) => {
        if (typeof url !== "string") return false;
        const method =
          typeof init === "object" && (init as RequestInit | undefined)?.method;
        return method === "PUT";
      });
      expect(saveCalls).toHaveLength(0);

      vi.unstubAllGlobals();
    });

  });
});

describe("EditableTagChips frequent-tag chips", () => {
  const SCOPED = [
    { name: "beef", count: 9 },
    { name: "carrot", count: 7 },
    { name: "onion", count: 5 },
  ];
  const DRIVE_WIDE = [
    ...SCOPED,
    { name: "faraway", count: 30 },
  ];
  const RECENT_KEY = `litloft:recent-tags:${file.drive}`;

  function mockPools(scoped = SCOPED, driveWide = DRIVE_WIDE) {
    vi.mocked(getDriveTags).mockImplementation(
      (async (_drive: string, folderPath?: string | null) =>
        folderPath ? scoped : driveWide) as never,
    );
  }

  function setRecent(names: string[]) {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(names));
  }

  function chipNames(): string[] {
    return screen.getAllByRole("option").map((el) => el.textContent ?? "");
  }

  async function openChips(props: Record<string, unknown> = {}) {
    render(<EditableTagChips file={file} initialTags={[]} {...props} />);
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
    clickAdd();
    return screen.findByRole("listbox");
  }

  beforeEach(() => {
    window.localStorage.clear();
    mockPools();
  });

  it("offers the folder's tags without anything typed", async () => {
    await openChips();
    expect(chipNames()).toEqual(["beef", "carrot", "onion"]);
  });

  it("puts recently used tags before the frequent ones", async () => {
    setRecent(["onion", "carrot"]);
    await openChips();
    expect(chipNames()).toEqual(["onion", "carrot", "beef"]);
  });

  it("drops a recent tag that no file in this folder carries", async () => {
    setRecent(["faraway", "onion"]);
    await openChips();
    expect(chipNames()).toEqual(["onion", "beef", "carrot"]);
  });

  it("drops a tag the file already has, ignoring case", async () => {
    await openChips({ initialTags: ["BEEF"] });
    expect(chipNames()).toEqual(["carrot", "onion"]);
  });

  it("drops a tag carried by no file", async () => {
    mockPools([...SCOPED, { name: "orphan", count: 0 }]);
    await openChips();
    expect(chipNames()).toEqual(["beef", "carrot", "onion"]);
  });

  it("shows at most eight chips", async () => {
    mockPools(
      Array.from({ length: 12 }, (_, i) => ({
        name: `tag${i}`,
        count: 100 - i,
      })),
    );
    await openChips();
    expect(chipNames()).toEqual([
      "tag0",
      "tag1",
      "tag2",
      "tag3",
      "tag4",
      "tag5",
      "tag6",
      "tag7",
    ]);
  });

  it("switches to drive-wide substring matching once the user types", async () => {
    await openChips();
    const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "far" } });
    await waitFor(() => expect(chipNames()).toEqual(["faraway"]));
  });

  it("opens nothing in a folder whose files carry no tags", async () => {
    mockPools([]);
    render(<EditableTagChips file={file} initialTags={[]} />);
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
    clickAdd();
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("offers no chips for a file sitting at the drive root", async () => {
    render(
      <EditableTagChips file={{ ...file, folder_path: "" }} initialTags={[]} />,
    );
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(1));
    clickAdd();
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("records a clicked chip as recently used", async () => {
    await openChips();
    fireEvent.pointerUp(screen.getByRole("option", { name: "carrot" }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual([
        "carrot",
      ]);
    });
  });

  it("enforces the tag cap on a chip click", async () => {
    const full = Array.from({ length: 10 }, (_, i) => `t${i}`);
    await openChips({ initialTags: full });
    fireEvent.pointerUp(screen.getByRole("option", { name: "beef" }));
    expect(screen.getByText("Maximum 10 tags allowed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Remove beef")).toBeNull();
  });

  it("does not commit a chip left selected by an earlier search", async () => {
    const onChange = vi.fn();
    await openChips({ onTagsChange: onChange });
    const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ca" } });
    await waitFor(() => expect(chipNames()).toEqual(["carrot"]));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves the next click alive while chips are showing", async () => {
    const outside = vi.fn();
    render(
      <div>
        <button type="button" onClick={outside}>
          elsewhere
        </button>
        <EditableTagChips file={file} initialTags={[]} />
      </div>,
    );
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
    clickAdd();
    await screen.findByRole("listbox");
    const target = screen.getByRole("button", { name: "elsewhere" });
    fireEvent.pointerDown(target);
    fireEvent.click(target);
    expect(outside).toHaveBeenCalledTimes(1);
  });

  it("keeps working when localStorage refuses every operation", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("site data blocked");
      },
    });
    try {
      const onChange = vi.fn();
      render(
        <EditableTagChips file={file} initialTags={["kept"]} onTagsChange={onChange} />,
      );
      await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
      clickAdd();
      await screen.findByRole("listbox");
      expect(chipNames()).toEqual(["beef", "carrot", "onion"]);
      fireEvent.pointerUp(screen.getByRole("option", { name: "beef" }));
      await waitFor(() => expect(onChange).toHaveBeenCalledWith(["kept", "beef"]));
      fireEvent.click(screen.getByLabelText("Remove kept"));
      await waitFor(() => expect(onChange).toHaveBeenCalledWith(["beef"]));
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });

  it("offers a tag created this session on the next file in the folder", async () => {
    // The detail view does not remount this component when the file
    // changes, so the move is a re-render, not a fresh mount.
    const { rerender } = render(<EditableTagChips file={file} initialTags={[]} />);
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
    clickAdd();
    await screen.findByRole("listbox");
    const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "kimchi" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByLabelText("Remove kimchi")).toBeInTheDocument(),
    );

    rerender(
      <EditableTagChips file={{ ...file, id: "fVid0000002B" }} initialTags={[]} />,
    );
    clickAdd();
    await screen.findByRole("listbox");
    expect(chipNames()).toContain("kimchi");
  });

  it("offers a recent tag under the spelling the drive holds", async () => {
    setRecent(["BEEF"]);
    await openChips();
    expect(chipNames()).toEqual(["beef", "carrot", "onion"]);
  });

  it("never paints another drive's tags after a drive switch", async () => {
    const OTHER = [{ name: "invoice", count: 3 }];
    vi.mocked(getDriveTags).mockImplementation(
      (async (drive: string, folderPath?: string | null) => {
        if (!folderPath) return DRIVE_WIDE;
        return drive === "media" ? SCOPED : OTHER;
      }) as never,
    );
    const { rerender } = render(<EditableTagChips file={file} initialTags={[]} />);
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
    clickAdd();
    await screen.findByRole("listbox");
    expect(chipNames()).toEqual(["beef", "carrot", "onion"]);

    rerender(
      <EditableTagChips
        file={{ ...file, id: "fWrk0000001A", drive: "work" }}
        initialTags={[]}
      />,
    );
    expect(screen.queryAllByRole("option", { name: "beef" })).toHaveLength(0);
    await waitFor(() => expect(chipNames()).toEqual(["invoice"]));
  });

  it("arms the outside-press guard once the user types", async () => {
    const outside = vi.fn();
    render(
      <div>
        <button type="button" onClick={outside}>
          elsewhere
        </button>
        <EditableTagChips file={file} initialTags={[]} />
      </div>,
    );
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
    clickAdd();
    const input = screen.getByPlaceholderText("Tag name...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bee" } });
    await waitFor(() => expect(chipNames()).toEqual(["beef"]));
    const target = screen.getByRole("button", { name: "elsewhere" });
    fireEvent.pointerDown(target);
    fireEvent.click(target);
    expect(outside).not.toHaveBeenCalled();
  });

  it("drops a tag the file already has from the recent half too", async () => {
    setRecent(["carrot"]);
    await openChips({ initialTags: ["carrot"] });
    expect(chipNames()).toEqual(["beef", "onion"]);
  });

  it("survives a stored value holding something that is not a tag", async () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(["onion", 5, null]));
    await openChips();
    expect(chipNames()).toEqual(["onion", "beef", "carrot"]);
  });

  it("never paints the previous folder's tags after a move", async () => {
    const FIRST = [{ name: "beef", count: 4 }];
    const SECOND = [{ name: "quartz", count: 4 }];
    vi.mocked(getDriveTags).mockImplementation(
      (async (_drive: string, folderPath?: string | null) => {
        if (!folderPath) return DRIVE_WIDE;
        return folderPath === "clips" ? FIRST : SECOND;
      }) as never,
    );
    const { rerender } = render(<EditableTagChips file={file} initialTags={[]} />);
    await waitFor(() => expect(getDriveTags).toHaveBeenCalledTimes(2));
    clickAdd();
    await screen.findByRole("listbox");
    expect(chipNames()).toEqual(["beef"]);

    rerender(
      <EditableTagChips
        file={{ ...file, id: "fVid0000002B", folder_path: "archive" }}
        initialTags={[]}
      />,
    );
    expect(screen.queryAllByRole("option", { name: "beef" })).toHaveLength(0);
    await waitFor(() => expect(chipNames()).toEqual(["quartz"]));
  });
});
