"use client";

import { useCallback } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { ReadingApp } from "@/components/readingapp/ReadingApp";

export default function ReadingAppPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const driveName = decodeURIComponent(params.name as string);
  const removeTarget = useCallback(() => {
    if (!search.has("target")) return;
    const next = new URLSearchParams(search);
    next.delete("target");
    const query = next.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`);
  }, [pathname, router, search]);
  return (
    <ReadingApp
      key={driveName}
      drive={driveName}
      target={search.get("target")}
      homeEntry="reading"
      onTargetHandled={removeTarget}
    />
  );
}
