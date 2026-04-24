"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { getDriveTags } from "@/lib/api";
import {
  createDebouncedTagSaver,
  TAG_SAVE_DEBOUNCE_MS,
} from "@/lib/tags";
import type { FileItem } from "@/types";

type FileRef = Pick<FileItem, "id" | "mime_type" | "filename" | "drive">;

// Mirror of core's TagUpdate.validate_tags (backend/app/schemas.py:59)
// and the scanner's _normalise_tags. Frontmatter.ts's extractValidTags
// already applies this on the save path; we also check at input time
// so the user sees a friendly inline error instead of a silent drop.
const TAG_RE = /^[\p{L}\p{N}_-]+$/u;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;

/**
 * Editable chip group for a file's tags.
 *
 * Handles the split canonical store internally via ``saveFileTags``:
 * ``.md`` files round-trip frontmatter while everything else PUTs
 * ``File.tags`` directly. Callers pass a file reference and the
 * initial tag list; the component owns the rest (optimistic state,
 * 2s debounced persist, autocomplete fetch, keyboard nav, error
 * surface).
 *
 * Spec: ``docs/superpowers/specs/2026-04-24-knowledge-tag-unification.md``
 * §D4 (Properties Panel chip edit) and §D7 (debounce).
 */
export function EditableTagChips({
  file,
  initialTags,
  onTagsChange,
}: {
  file: FileRef;
  initialTags: string[];
  /**
   * Optimistic: fires with the desired tag list as soon as the user
   * edits. NOT rolled back automatically on save failure — on error
   * the component surfaces an inline message and ``onTagsChange`` is
   * fired again with ``initialTags`` so the parent can reconcile its
   * own optimistic state to the last-known-good value.
   */
  onTagsChange?: (tags: string[]) => void;
}) {
  const t = useTranslations("tag");
  const [tags, setTags] = useState<string[]>(initialTags);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Parent re-renders often hand us a fresh array ref even when the
  // contents haven't changed (e.g. the parent just memoised a slice).
  // Resyncing on ref-identity would clobber optimistic local state
  // between commit() and the debounced save landing, so compare the
  // serialised values instead.
  const lastInitialTagsKey = useRef(JSON.stringify(initialTags));

  useEffect(() => {
    const key = JSON.stringify(initialTags);
    if (key !== lastInitialTagsKey.current) {
      lastInitialTagsKey.current = key;
      setTags(initialTags);
    }
  }, [initialTags]);

  // Always hard-reset when navigating to a different file.
  useEffect(() => {
    lastInitialTagsKey.current = JSON.stringify(initialTags);
    setTags(initialTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  // Drive-scoped autocomplete source. Refetched only on drive change;
  // within a drive, newly-added tags are appended to ``allTags``
  // locally inside ``commit()`` so the autocomplete stays fresh
  // without a per-edit round-trip.
  useEffect(() => {
    let cancelled = false;
    getDriveTags(file.drive)
      .then((list) => {
        if (!cancelled) setAllTags(list.map((tag) => tag.name));
      })
      .catch(() => {
        // Autocomplete is a nice-to-have. Silently fall back to
        // no suggestions if the endpoint is unavailable.
        if (!cancelled) setAllTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [file.drive]);

  const saver = useMemo(
    () =>
      createDebouncedTagSaver(file, {
        delayMs: TAG_SAVE_DEBOUNCE_MS,
        onError: () => {
          setError(t("updateFailed"));
          // Roll back to the last-known-good tag list so the user and
          // any ``onTagsChange`` consumer can recover.
          setTags(initialTags);
          onTagsChange?.(initialTags);
        },
      }),
    // next-intl's ``t`` is referentially stable across re-renders at
    // the same locale, so including it does not churn the saver.
    [file.id, file.mime_type, file.filename, file.drive, t, initialTags, onTagsChange],
  );

  // Flush pending saves on unmount and when the file reference
  // changes so chip edits on a note don't silently land after the
  // user has navigated away.
  useEffect(() => {
    return () => {
      saver.cancel();
    };
  }, [saver]);

  const commit = useCallback(
    (next: string[]) => {
      setTags(next);
      setError(null);
      onTagsChange?.(next);
      // Keep autocomplete fresh for this drive without a round-trip:
      // a tag the user just added should be a suggestion next time.
      setAllTags((prev) => {
        const existing = new Set(prev.map((x) => x.toLowerCase()));
        const toAdd = next.filter((x) => !existing.has(x.toLowerCase()));
        return toAdd.length === 0 ? prev : [...prev, ...toAdd];
      });
      saver.schedule(next);
    },
    [onTagsChange, saver],
  );

  const suggestions = useMemo(() => {
    if (!input.trim()) return [] as string[];
    const lower = input.trim().toLowerCase();
    const existing = new Set(tags.map((t) => t.toLowerCase()));
    return allTags
      .filter((t) => t.toLowerCase().includes(lower) && !existing.has(t.toLowerCase()))
      .slice(0, 5);
  }, [input, allTags, tags]);

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
        // Already present — silently close the input.
        setInput("");
        setAdding(false);
        return;
      }
      if (tags.length >= MAX_TAGS) {
        setError(t("maxCount"));
        return;
      }
      commit([...tags, trimmed]);
      setInput("");
      setAdding(false);
    },
    [commit, tags, t],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      commit(tags.filter((x) => x !== tagToRemove));
    },
    [commit, tags],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (composing) return;
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
        setAdding(false);
        setInput("");
        setError(null);
      } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
        // Familiar chip-group shortcut: empty input + Backspace drops
        // the last chip. Matches Gmail / GitHub / Obsidian.
        removeTag(tags[tags.length - 1]);
      }
    },
    [composing, input, removeTag, selectedIndex, submitTag, suggestions, tags],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent-teal/15 px-2 py-0.5 text-xs text-accent-teal"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5 hover:bg-bg-elevated"
              aria-label={t("removeTag", { tag })}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {adding ? (
          <div className="relative">
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onBlur={() => {
                setTimeout(() => {
                  setAdding(false);
                  setInput("");
                  setError(null);
                }, 200);
              }}
              placeholder={t("placeholder")}
              className="w-32 rounded-full bg-bg-card px-2 py-0.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
            />
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 z-10 mt-1 w-40 rounded-lg bg-bg-card py-1 shadow-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={s}
                    type="button"
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
            )}
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
