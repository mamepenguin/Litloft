"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import { getFilesProcessing, type FileProcessing } from "@/lib/api";
import { inboxStageNeedsPoll } from "@/lib/inboxStage";
import type { InboxItem } from "@/lib/api";

const STAGE_TICK_MS = 30_000;
const STAGE_BATCH_SIZE = 100;

/**
 * The stage each loaded arrival's file reported, refreshed when the page
 * loads, on that file's `processing.updated`, and every 30 s while a tick
 * could still change it.
 */
export function useInboxStages(items: readonly InboxItem[]) {
  const [answers, setAnswers] = useState<
    Record<string, FileProcessing | null | undefined>
  >({});

  const loadedRef = useRef<Set<string>>(new Set());
  const loaded = useMemo(
    () => new Set(items.map((item) => item.file.id)),
    [items],
  );
  loadedRef.current = loaded;

  const fetchStages = useCallback(async (ids: readonly string[]) => {
    const wanted = [...new Set(ids)].filter((id) => loadedRef.current.has(id));
    for (let start = 0; start < wanted.length; start += STAGE_BATCH_SIZE) {
      const batch = wanted.slice(start, start + STAGE_BATCH_SIZE);
      try {
        const answer = await getFilesProcessing(batch);
        setAnswers((previous) => {
          const next = { ...previous };
          for (const id of batch) next[id] = answer.files[id] ?? null;
          return next;
        });
      } catch {
        // The next tick or event asks again.
      }
    }
  }, []);

  useEffect(() => {
    void fetchStages(items.map((item) => item.file.id));
  }, [items, fetchStages]);

  const pollKey = items
    .map((item) => item.file.id)
    .filter((id) => inboxStageNeedsPoll(answers[id]))
    .join(",");

  useEffect(() => {
    if (!pollKey) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void fetchStages(pollKey.split(","));
    };
    const timer = setInterval(tick, STAGE_TICK_MS);
    return () => clearInterval(timer);
  }, [pollKey, fetchStages]);

  const { lastEvent } = useContext(WebSocketContext);
  const handledEvent = useRef(lastEvent);
  useEffect(() => {
    if (!lastEvent || lastEvent === handledEvent.current) return;
    handledEvent.current = lastEvent;
    if (lastEvent.event !== "processing.updated") return;
    const ids = lastEvent.data.file_ids;
    if (!Array.isArray(ids)) return;
    void fetchStages(
      ids.filter((id): id is string => typeof id === "string"),
    );
  }, [lastEvent, fetchStages]);

  return answers;
}
