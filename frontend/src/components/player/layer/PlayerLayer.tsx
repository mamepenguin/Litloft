"use client";

import {
  Component,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { FindMarksProvider } from "@/components/FileDetail/find/FindContext";
import { QueuePageProvider } from "@/components/queue/QueuePageContext";

import {
  PlayerLayerContext,
  PlayerLayerStore,
} from "./PlayerLayerContext";

interface Area {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function isFullscreenNow(frame: HTMLElement | null): boolean {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement != null) return true;
  if (document.documentElement.dataset.playerFullscreen === "true") return true;
  return frame?.querySelector("[data-pseudo-fullscreen]") != null;
}

/**
 * The part of the slot not cut off by an ancestor that clips, computed the way
 * a reader sees it: any non-visible overflow on either axis clips both.
 */
function visibleArea(slot: HTMLElement, rect: DOMRect): Area {
  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;
  for (let el = slot.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const box = el.getBoundingClientRect();
    left = Math.max(left, box.left);
    top = Math.max(top, box.top);
    right = Math.min(right, box.right);
    bottom = Math.min(bottom, box.bottom);
  }
  return { left, top, right, bottom };
}

function clipPathFor(slot: HTMLElement, rect: DOMRect): string {
  const area = visibleArea(slot, rect);
  if (area.right <= area.left || area.bottom <= area.top) return "inset(50%)";
  const top = Math.max(0, area.top - rect.top);
  const left = Math.max(0, area.left - rect.left);
  const right = Math.max(0, rect.right - area.right);
  const bottom = Math.max(0, rect.bottom - area.bottom);
  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}

function nearestScroller(slot: HTMLElement): HTMLElement | null {
  for (let el = slot.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return null;
}

class PlayerErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) return <PlayerErrorCard />;
    return this.props.children;
  }
}

function PlayerErrorCard() {
  const t = useTranslations("player");
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
      <p className="text-sm text-danger">{t("loadFailed")}</p>
    </div>
  );
}

function PlayerLayerFrame({ store }: { store: PlayerLayerStore }) {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const served = store.getServed();
  const servedId = served?.id ?? null;
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const follow = useCallback(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    const slot = store.getServed()?.slotEl;
    if (!frame || !slot) return;

    const fullscreen = isFullscreenNow(frame);

    if (slot.getClientRects().length === 0) {
      frame.style.display = "none";
      frame.inert = true;
      return;
    }
    frame.style.display = "";
    frame.inert = false;

    let rect = slot.getBoundingClientRect();
    frame.style.top = `${rect.top}px`;
    frame.style.left = `${rect.left}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;

    // The slot's height is the player's own content height. Read after the
    // frame got the slot's width, or a first measurement sees a zero-width
    // player. Not while full screen: there the slot keeps its previous box.
    if (!fullscreen && content) {
      const height = content.getBoundingClientRect().height;
      if (height > 0) {
        const next = `${height}px`;
        if (slot.style.height !== next) slot.style.height = next;
        rect = slot.getBoundingClientRect();
        frame.style.top = `${rect.top}px`;
        frame.style.left = `${rect.left}px`;
        frame.style.width = `${rect.width}px`;
        frame.style.height = `${rect.height}px`;
      }
    }

    frame.style.clipPath = fullscreen ? "none" : clipPathFor(slot, rect);
  }, [store]);

  // After every commit that can move the slot: React-driven layout changes are
  // already laid out when this runs, so the box is set before the paint.
  useLayoutEffect(() => {
    follow();
  });

  useLayoutEffect(() => {
    const slot = store.getServed()?.slotEl;
    if (!slot) return;

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => follow());
    if (observer) {
      observer.observe(slot);
      for (let el = slot.parentElement; el; el = el.parentElement) {
        observer.observe(el);
      }
      if (contentRef.current) observer.observe(contentRef.current);
    }

    const schedule = () => follow();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    document.addEventListener("fullscreenchange", schedule);

    const mutations =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(schedule);
    mutations?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-player-fullscreen"],
    });
    mutations?.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-pseudo-fullscreen"],
      subtree: true,
    });

    // A transition moves the slot over many frames without a resize of a
    // box that is observed. Follow it for the frames it runs. Only the slot's
    // own ancestors: a toast's fade cannot move the player.
    let animation = 0;
    const runTransition = (event: Event) => {
      const slot = store.getServed()?.slotEl;
      const target = event.target;
      if (!slot || !(target instanceof Element)) return;
      if (target !== slot && !target.contains(slot)) return;
      cancelAnimationFrame(animation);
      let left = 40;
      const tick = () => {
        follow();
        left -= 1;
        if (left > 0) animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
    };
    document.addEventListener("transitionrun", runTransition);
    document.addEventListener("transitionstart", runTransition);
    document.addEventListener("transitionend", runTransition);
    document.addEventListener("transitioncancel", runTransition);

    // The layer is outside the page's scroller, so a wheel over it would
    // scroll whatever is behind the layer instead of the page.
    const frame = frameRef.current;
    const onWheel = (event: WheelEvent) => {
      const slot = store.getServed()?.slotEl;
      const scroller = slot ? nearestScroller(slot) : null;
      if (!scroller) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? scroller.clientHeight
            : 1;
      scroller.scrollTop += event.deltaY * unit;
    };
    frame?.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      cancelAnimationFrame(animation);
      frame?.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("fullscreenchange", schedule);
      document.removeEventListener("transitionrun", runTransition);
      document.removeEventListener("transitionstart", runTransition);
      document.removeEventListener("transitionend", runTransition);
      document.removeEventListener("transitioncancel", runTransition);
    };
  }, [store, servedId, follow]);

  if (!served) return null;
  return (
    <div ref={frameRef} data-player-layer={served.id}>
      <QueuePageProvider value={served.queuePage}>
        <FindMarksProvider value={served.findMarks}>
          <div ref={contentRef} className="w-full">
            <PlayerErrorBoundary key={served.id}>
              {served.player}
            </PlayerErrorBoundary>
          </div>
        </FindMarksProvider>
      </QueuePageProvider>
    </div>
  );
}

export function PlayerLayerProvider({
  enabled = true,
  children,
}: {
  enabled?: boolean;
  children: ReactNode;
}) {
  const store = useMemo(
    () => (enabled ? new PlayerLayerStore() : null),
    [enabled],
  );
  if (!store) return <>{children}</>;
  return (
    <PlayerLayerContext.Provider value={store}>
      {children}
      <PlayerLayerFrame store={store} />
    </PlayerLayerContext.Provider>
  );
}
