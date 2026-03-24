"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { getDriveTags, updateFileTags } from "@/lib/api";
import type { FileItem } from "@/types";
import { useSidebar } from "./SidebarProvider";

export function TagEditor({
  fileId,
  drive,
  tags,
  onUpdate,
}: {
  fileId: number;
  drive: string;
  tags: string[];
  onUpdate: (file: FileItem) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { requestRefresh } = useSidebar();

  useEffect(() => {
    getDriveTags(drive).then((t) => setAllTags(t.map((tag) => tag.name)));
  }, [drive, tags]);

  useEffect(() => {
    if (input.trim()) {
      const lower = input.trim().toLowerCase();
      const filtered = allTags.filter(
        (t) =>
          t.toLowerCase().includes(lower) &&
          !tags.some((existing) => existing.toLowerCase() === t.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 5));
    } else {
      setSuggestions([]);
    }
    setSelectedIndex(-1);
  }, [input, allTags, tags]);

  async function submitTag(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (trimmed.length > 30) {
      setError("タグは30文字以内にしてください");
      return;
    }
    if (!/^[\p{L}\p{N}_\-]+$/u.test(trimmed)) {
      setError("使用できない文字が含まれています");
      return;
    }
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setInput("");
      setSuggestions([]);
      return;
    }
    if (tags.length >= 10) {
      setError("タグは最大10個までです");
      return;
    }

    setError(null);
    try {
      const updated = await updateFileTags(fileId, [...tags, trimmed]);
      onUpdate(updated);
      requestRefresh();
      setInput("");
      setAdding(false);
    } catch {
      setError("タグの更新に失敗しました");
    }
  }

  async function removeTag(tagToRemove: string) {
    try {
      const updated = await updateFileTags(
        fileId,
        tags.filter((t) => t !== tagToRemove)
      );
      onUpdate(updated);
      requestRefresh();
    } catch {
      setError("タグの削除に失敗しました");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
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
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-accent-teal/15 px-2.5 py-1 text-sm font-medium text-accent-teal"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5 hover:bg-bg-elevated hover:text-text-primary"
              aria-label={`${tag} を削除`}
            >
              <X size={12} />
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
              placeholder="タグ名..."
              className="w-32 rounded-full bg-bg-card px-2.5 py-1 text-xs text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
            />
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 z-10 mt-1 w-40 rounded-lg bg-bg-card py-1 shadow-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={s}
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
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-full bg-bg-card px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            <Plus size={12} />
            タグ追加
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
