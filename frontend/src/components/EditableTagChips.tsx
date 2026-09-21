"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { DismissScrim } from "@/components/DismissScrim";
import {
  ANCHORED_VERTICAL,
  useAnchoredDirection,
} from "@/hooks/useAnchoredDirection";
import { getDriveTags } from "@/lib/api";
import { useImeKeyGuard } from "@/lib/ime";
import { extractValidTags, parseNote, withTags } from "@/lib/frontmatter";
import { readRecentTags, recordRecentTag } from "@/lib/recentTags";
import {
  createDebouncedTagSaver,
  TAG_SAVE_DEBOUNCE_MS,
} from "@/lib/tags";
import type { FileItem, Tag } from "@/types";

type FileRef = Pick<
  FileItem,
  "id" | "mime_type" | "filename" | "drive" | "folder_path"
>;

// Mirror of core's TagUpdate.validate_tags.
const TAG_RE = /^[\p{L}\p{N}_-]+$/u;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;
const CHIP_LIMIT = 8;
const TYPED_SUGGESTION_LIMIT = 5;

export interface EditableTagChipsProps {
  file: FileRef;
  initialTags?: string[];
  /**
   * Content mode exists so the Knowledge editor (which has its own
   * textarea auto-save on the same file) doesn't race a second
   * writer.
   */
  content?: string;
  onContentChange?: (nextContent: string) => void;
  /**
   * Standalone mode only: fires with the desired tag list as soon as
   * the user edits. NOT rolled back automatically on save failure —
   * on error the component surfaces an inline message and fires
   * ``onTagsChange`` again with ``initialTags`` so the parent can
   * reconcile its own optimistic state to the last-known-good value.
   * Ignored in content mode.
   */
  onTagsChange?: (tags: string[]) => void;
  onSaveSuccess?: (tags: string[]) => void;
}

export function EditableTagChips(props: EditableTagChipsProps) {
  const { file, initialTags, content, onContentChange, onTagsChange, onSaveSuccess } = props;
  const contentMode = content !== undefined && onContentChange !== undefined;
  const seedTags = useMemo(
    () =>
      contentMode
        ? extractValidTags(parseNote(content!).metadata)
        : initialTags ?? [],
    [contentMode, content, initialTags],
  );
  const t = useTranslations("tag");
  const [tags, setTags] = useState<string[]>(seedTags);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  // Carries the scope it was fetched for. Comparing that at render time
  // rather than clearing inside the effect is what keeps the previous
  // folder's tags off the screen: the effect body runs after the commit
  // that would already have painted them, and this component is not
  // remounted when `file` changes.
  const [tagPool, setTagPool] = useState<{
    drive: string;
    folderPath: string;
    all: string[];
    scoped: Tag[];
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const ime = useImeKeyGuard();
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Track the latest ``content`` so ``commit`` can read the current
  // value at click time rather than the value captured by its
  // useCallback closure. Without this, a chip click that races a
  // keystroke in the parent's textarea would run withTags on
  // pre-keystroke content and overwrite the typed chars via
  // onContentChange. Ref is assigned during render so the click
  // handler always sees the most recent prop.
  const contentRef = useRef<string | undefined>(content);
  contentRef.current = content;
  // Route callbacks through refs so the debounced saver's useMemo
  // doesn't re-create when the parent passes inline lambdas. Without
  // this, our own ``onTagsChange`` optimistic-update fires the
  // parent's setState, which re-renders with fresh lambda refs,
  // which invalidates the saver useMemo, which triggers the effect
  // cleanup → ``saver.cancel()`` → the debounced save gets dropped
  // before it can fire.
  const onTagsChangeRef = useRef(onTagsChange);
  onTagsChangeRef.current = onTagsChange;
  const onSaveSuccessRef = useRef(onSaveSuccess);
  onSaveSuccessRef.current = onSaveSuccess;
  const seedTagsRef = useRef<string[]>(seedTags);
  seedTagsRef.current = seedTags;
  const tRef = useRef(t);
  tRef.current = t;
  // Parent re-renders often hand us a fresh array ref even when the
  // contents haven't changed (e.g. the parent just memoised a slice).
  // Resyncing on ref-identity would clobber optimistic local state
  // between commit() and the debounced save landing, so compare the
  // serialised values instead.
  const lastSeedKey = useRef(JSON.stringify(seedTags));

  useEffect(() => {
    const key = JSON.stringify(seedTags);
    if (key !== lastSeedKey.current) {
      lastSeedKey.current = key;
      setTags(seedTags);
    }
    // seedTags is derived from props every render; depending on it via
    // JSON.stringify equality keeps the effect stable even when the
    // parent reformats frontmatter (gray-matter reserialisation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(seedTags)]);

  useEffect(() => {
    lastSeedKey.current = JSON.stringify(seedTags);
    setTags(seedTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  useEffect(() => {
    const drive = file.drive;
    const folderPath = file.folder_path;
    let cancelled = false;
    Promise.all([
      getDriveTags(drive).catch(() => [] as Tag[]),
      // A file at the drive root has no folder neighbourhood; scoping to
      // the whole drive there would offer the very tags the folder scope
      // exists to keep out.
      folderPath
        ? getDriveTags(drive, folderPath).catch(() => [] as Tag[])
        : Promise.resolve([] as Tag[]),
    ])
      .then(([all, scopedTags]) => {
        if (cancelled) return;
        setTagPool({
          drive,
          folderPath,
          all: all.map((tag) => tag.name),
          scoped: scopedTags,
        });
      })
      // Trailing, so a response that is not the shape the types promise
      // empties the pool instead of escaping as an unhandled rejection.
      .catch(() => {
        if (!cancelled) setTagPool({ drive, folderPath, all: [], scoped: [] });
      });
    return () => {
      cancelled = true;
    };
    // Both halves of the key matter: two drives commonly share a folder
    // path, so keying on the path alone would keep the previous drive's
    // tags across a drive switch.
  }, [file.drive, file.folder_path]);

  // Debounced saver is only built in standalone mode — content mode
  // delegates saving to the parent (e.g. Knowledge editor's textarea
  // auto-save), so a second writer here would race.
  const saver = useMemo(
    () =>
      contentMode
        ? null
        : createDebouncedTagSaver(file, {
            delayMs: TAG_SAVE_DEBOUNCE_MS,
            onError: () => {
              setError(tRef.current("updateFailed"));
              setTags(seedTagsRef.current);
              onTagsChangeRef.current?.(seedTagsRef.current);
            },
            onSaveSuccess: (tags) => onSaveSuccessRef.current?.(tags),
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentMode, file.id, file.mime_type, file.filename, file.drive],
  );

  useEffect(() => {
    return () => {
      saver?.cancel();
    };
  }, [saver]);

  const commit = useCallback(
    (next: string[]) => {
      setTags(next);
      setError(null);
      onTagsChange?.(next);
      setTagPool((prev) => {
        if (
          !prev ||
          prev.drive !== file.drive ||
          prev.folderPath !== file.folder_path
        ) {
          return prev;
        }
        const inAll = new Set(prev.all.map((x) => x.toLowerCase()));
        const addedAll = next.filter((x) => !inAll.has(x.toLowerCase()));
        // The file being written is in this folder, so a tag it now
        // carries is one this folder carries — without folding it in
        // here, the tag just used is filtered out of the chips until
        // something else refetches.
        const inScoped = new Set(prev.scoped.map((t) => t.name.toLowerCase()));
        const addedScoped = next
          .filter((x) => !inScoped.has(x.toLowerCase()))
          .map((name) => ({ name, count: 1 }));
        if (addedAll.length === 0 && addedScoped.length === 0) return prev;
        return {
          ...prev,
          all: [...prev.all, ...addedAll],
          scoped: [...prev.scoped, ...addedScoped],
        };
      });
      if (contentMode) {
        const latest = contentRef.current ?? "";
        const nextContent = withTags(latest, next);
        onContentChange!(nextContent);
      } else {
        saver!.schedule(next);
      }
    },
    // ``content`` intentionally excluded from deps: we read its
    // latest value via contentRef.current to avoid the TOCTOU where
    // a stale closure overwrites concurrent parent-side edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentMode, file.drive, file.folder_path, onContentChange, onTagsChange, saver],
  );

  const pool = useMemo(
    () =>
      tagPool &&
      tagPool.drive === file.drive &&
      tagPool.folderPath === file.folder_path
        ? tagPool
        : null,
    [tagPool, file.drive, file.folder_path],
  );
  const suggestions = useMemo(() => {
    const allTags = pool?.all ?? [];
    const scoped = pool?.scoped ?? [];
    const onFile = new Set(tags.map((t) => t.toLowerCase()));
    const typed = input.trim().toLowerCase();
    if (typed) {
      return allTags
        .filter((t) => t.toLowerCase().includes(typed) && !onFile.has(t.toLowerCase()))
        .slice(0, TYPED_SUGGESTION_LIMIT);
    }
    // A tag with no files is returned for every folder — the folder
    // filter in `list_drive_tags` lets orphans through, and nothing
    // clears them when their last file is hard-deleted.
    const carried = scoped.filter((tag) => tag.count > 0);
    // Offer the drive's own spelling, not the one this device happens to
    // have stored: `replace_file_tags` renames the shared `Tag` row to
    // whatever casing was written last, so a drifted recent entry would
    // rename the tag for every file that carries it.
    const canonical = new Map(
      carried.map((tag) => [tag.name.toLowerCase(), tag.name] as const),
    );
    const recent = readRecentTags(file.drive)
      .map((name) => canonical.get(name.toLowerCase()))
      .filter(
        (name): name is string =>
          name !== undefined && !onFile.has(name.toLowerCase()),
      );
    const recentLower = new Set(recent.map((name) => name.toLowerCase()));
    const byCount = [...carried]
      .sort((a, b) => b.count - a.count)
      .map((tag) => tag.name)
      .filter((name) => {
        const lower = name.toLowerCase();
        return !recentLower.has(lower) && !onFile.has(lower);
      });
    return [...recent, ...byCount].slice(0, CHIP_LIMIT);
  }, [input, pool, tags, file.drive]);

  const { openUp, side } = useAnchoredDirection({
    triggerRef: fieldRef,
    panelRef: listRef,
    open: suggestions.length > 0,
    gapPx: ANCHORED_VERTICAL[1].px,
    preferSide: "left",
  });

  const closeInput = useCallback(() => {
    setAdding(false);
    setInput("");
    setSelectedIndex(-1);
    setError(null);
  }, []);

  const submitTag = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_TAG_LEN) {
        setError(t("maxLength"));
        return;
      }
      if (!TAG_RE.test(trimmed)) {
        setError(t("invalidChars"));
        return;
      }
      if (tags.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        closeInput();
        return;
      }
      if (tags.length >= MAX_TAGS) {
        setError(t("maxCount"));
        return;
      }
      commit([...tags, trimmed]);
      // After the commit: a refused write must not cost the tag add.
      recordRecentTag(file.drive, trimmed);
      closeInput();
    },
    [closeInput, commit, file.drive, tags, t],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      commit(tags.filter((x) => x !== tagToRemove));
    },
    [commit, tags],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (ime.isImeKeystroke(e)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          submitTag(suggestions[selectedIndex]);
        } else {
          submitTag(input);
        }
      } else if (e.key === "Escape") {
        closeInput();
      } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      }
    },
    [closeInput, ime, input, removeTag, selectedIndex, submitTag, suggestions, tags],
  );

  const typing = input.trim().length > 0;
  const suggestionList = (
    <div
      ref={listRef}
      role="listbox"
      aria-label={typing ? t("placeholder") : t("frequentTags")}
      // Above the sticky tab strip, which is `z-10` and later
      // in the document: at an equal tier the strip wins the
      // paint order and covers the top of this list, and taps
      // that look like they land on a suggestion reach the strip
      // instead.
      className={`absolute z-30 w-40 rounded-lg bg-bg-card py-1 shadow-lg ${
        ANCHORED_VERTICAL[1][openUp ? "up" : "down"]
      } ${side === "left" ? "left-0" : "right-0"}`}
    >
      {suggestions.map((s, i) => (
        <button
          key={s}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => e.preventDefault()}
          onPointerUp={() => submitTag(s)}
          className={`block w-full px-3 py-1.5 text-left text-xs ${
            i === selectedIndex
              ? "bg-accent text-white"
              : "text-text-muted hover:bg-bg-elevated"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-accent-teal/15 px-2 py-0.5 text-xs text-accent-teal"
          >
            <span className="truncate" title={tag}>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="flex-shrink-0 rounded-full p-0.5 hover:bg-bg-elevated"
              aria-label={t("removeTag", { tag })}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {adding ? (
          <div ref={fieldRef} className="relative">
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              onCompositionEnd={ime.onCompositionEnd}
              onBlur={() => {
                // The delay is for the suggestion rows: `onPointerUp`
                // fires after `blur`, and closing immediately would
                // unmount the row mid-press.
                setTimeout(closeInput, 200);
              }}
              placeholder={t("placeholder")}
              className="w-32 rounded-full bg-bg-card px-2 py-0.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
            />
            {suggestions.length > 0 &&
              // The scrim swallows the click its own dismissing press
              // produces, so it arms only once the user has typed —
              // its behaviour before chips existed. While chips are
              // showing, `onBlur` closes the input and the click lands
              // where it was aimed.
              (typing ? (
                <DismissScrim
                  onDismiss={closeInput}
                  className="fixed inset-0 z-30"
                >
                  {suggestionList}
                </DismissScrim>
              ) : (
                suggestionList
              ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full bg-bg-card px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            <Plus size={11} />
            {t("add")}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
