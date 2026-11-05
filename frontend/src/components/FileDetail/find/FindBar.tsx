"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useFind } from "./FindContext";
import { FindBarPresenter } from "./FindBarPresenter";

function countText(
  t: ReturnType<typeof useTranslations>,
  find: ReturnType<typeof useFind>,
): string | null {
  if (find.status.kind !== "hits") return null;
  const total = find.visibleRows.length;
  if (find.truncated) {
    if (find.currentIndex !== null) {
      return t("currentTruncated", {
        index: find.currentIndex + 1,
        total,
      });
    }
    return t("countTruncated", { count: total });
  }
  if (find.currentIndex !== null) {
    return t("current", { index: find.currentIndex + 1, total });
  }
  return t("count", { count: total });
}

function statusText(
  t: ReturnType<typeof useTranslations>,
  find: ReturnType<typeof useFind>,
): string | null {
  switch (find.status.kind) {
    case "notIndexed":
      return t("notIndexed");
    case "noHits":
      return t("noHits");
    case "unavailable":
      return t("unavailable");
    case "failed":
      return t("failed");
    default:
      return null;
  }
}

export function FindBar() {
  const find = useFind();
  const t = useTranslations("find");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const registerUrlStrip = find.registerUrlStrip;

  const stripFind = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("find")) return;
    params.delete("find");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    registerUrlStrip(stripFind);
    return () => registerUrlStrip(null);
  }, [registerUrlStrip, stripFind]);

  useEffect(() => {
    if (!find.open) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [find.open, find.focusNonce]);

  return (
    <FindBarPresenter
      inputRef={inputRef}
      query={find.query}
      count={countText(t, find)}
      message={statusText(t, find)}
      canRetry={find.status.kind === "failed"}
      onChange={find.changeQuery}
      onKeyDown={find.keyDown}
      onCompositionStart={find.compositionStart}
      onCompositionEnd={(value) => {
        find.compositionEnd();
        find.commitQuery(value);
      }}
      onPrevious={() => find.step("prev")}
      onNext={() => find.step("next")}
      onClose={find.closeFind}
      onRetry={find.retry}
    />
  );
}
