"use client";

// Admin layout: gates everything under /admin behind admin-viewer status.
// On mount it pulls /api/admin/config/setup-status (to redirect to /setup
// when first-run hasn't completed) and /api/admin/config/restart-status
// (which doubles as the admin-gate probe — the route is admin-only, so
// 403 here means "not an admin viewer", and the same response feeds the
// RestartBanner once we know the viewer is allowed in).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { RestartBanner } from "@/components/RestartBanner";
import { PageHeader } from "@/components/PageHeader";

type GateState = "loading" | "ok" | "forbidden";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const t = useTranslations("admin");
  const router = useRouter();
  const [gate, setGate] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // setup-status is intentionally unauthenticated so it can be polled
      // before the admin gate succeeds. completed=false is the wizard
      // trigger.
      try {
        const res = await fetch("/api/admin/config/setup-status", {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { completed: boolean };
          if (!cancelled && data.completed === false) {
            router.replace("/setup");
            return;
          }
        }
      } catch {
        // ignore — the admin gate below will surface a generic failure.
      }

      try {
        const res = await fetch("/api/admin/config/restart-status", {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.status === 403) {
          router.replace("/unlock?redirect=/admin");
          return;
        }
        setGate("ok");
      } catch {
        if (!cancelled) setGate("ok");
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (gate === "forbidden") {
    return (
      // 403 is what this route displays, so "you cannot see this" is the
      // page's subject and gets the page's heading — not a special case
      // that keeps a hand-written one.
      <div className="mx-auto max-w-2xl py-8">
        <PageHeader title={t("forbiddenTitle")} scope={t("forbiddenMessage")} />
      </div>
    );
  }

  // Avoid flashing admin children to non-admin viewers during the gate
  // probe. The probe is fast (single fetch) so a neutral placeholder is
  // less disruptive than rendering then yanking content away.
  if (gate === "loading") {
    return <div aria-busy="true" />;
  }

  return (
    <>
      <RestartBanner />
      {children}
    </>
  );
}
