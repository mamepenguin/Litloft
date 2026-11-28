"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useFindMarks } from "@/components/FileDetail/find/FindContext";
import { useQueuePage } from "@/components/queue/QueuePageContext";

import { usePlayerLayerStore } from "./PlayerLayerContext";

const noopSubscribe = () => () => {};

/**
 * The box the file page draws where its player goes. With a layer above it the
 * slot is empty and the layer draws the player over it; without one it renders
 * the player in place as its only child.
 */
export function PlayerSlot({ children }: { children: ReactNode }) {
  const store = usePlayerLayerStore();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const slotRef = useRef<HTMLDivElement>(null);
  const queuePage = useQueuePage();
  const findMarks = useFindMarks();

  const subscribe = useCallback(
    (listener: () => void) => (store ? store.subscribe(listener) : noopSubscribe()),
    [store],
  );
  const getServedId = useCallback(
    () => (store ? store.getServedId() : null),
    [store],
  );
  const servedId = useSyncExternalStore(subscribe, getServedId, () => null);
  const served = store !== null && servedId === id;

  useLayoutEffect(() => {
    if (!store) return;
    store.register({
      id,
      slotEl: slotRef.current,
      player: children,
      queuePage,
      findMarks,
    });
    return () => store.unregister(id);
    // The registration is per mount; later props reach the layer through the
    // update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, id]);

  useLayoutEffect(() => {
    if (!store) return;
    store.update({
      id,
      slotEl: slotRef.current,
      player: children,
      queuePage,
      findMarks,
    });
  });

  return (
    <div
      ref={slotRef}
      data-player-slot={id}
      // A slot that is waiting is still a box of the page's width, so the
      // page under it keeps its geometry until it is served.
      style={store && !served ? { aspectRatio: "16 / 9" } : undefined}
      className="w-full"
    >
      {store ? null : children}
    </div>
  );
}
