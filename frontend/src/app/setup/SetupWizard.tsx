"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";

import enMessages from "@/messages/en.json";
import jaMessages from "@/messages/ja.json";
import { defaultLocale } from "@/i18n/config";

import { UnlockStep } from "./steps/UnlockStep";
import { LanguageStep } from "./steps/LanguageStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import { DriveStep, type DriveDraft } from "./steps/DriveStep";
import {
  AccessModeStep,
  type AccessMode,
} from "./steps/AccessModeStep";
import {
  PasswordStep,
  type PasswordDraft,
} from "./steps/PasswordStep";
import { AddonPolicyStep } from "./steps/AddonPolicyStep";
import { CompleteStep } from "./steps/CompleteStep";
import { SetupShell } from "./components/SetupShell";
import { Stepper } from "./components/Stepper";
import type { Locale } from "@/i18n/config";
import {
  getAddonsStatus,
  isAddonOn,
  putAddonPolicy,
  SETUP_TOKEN_HEADER,
  type AddonPolicy,
  type AddonStatusEntry,
} from "@/lib/adminConfig";

type StepId =
  | "unlock"
  | "language"
  | "welcome"
  | "drive"
  | "accessMode"
  | "password"
  | "addonPolicy"
  | "complete";

const ORDER_PROTECTED: StepId[] = [
  "unlock",
  "language",
  "welcome",
  "drive",
  "accessMode",
  "password",
  "addonPolicy",
  "complete",
];

const ORDER_PUBLIC: StepId[] = [
  "unlock",
  "language",
  "welcome",
  "drive",
  "accessMode",
  "addonPolicy",
  "complete",
];

const STEPPER_PROTECTED: Exclude<StepId, "unlock" | "language" | "welcome">[] = [
  "drive",
  "accessMode",
  "password",
  "addonPolicy",
  "complete",
];

const STEPPER_PUBLIC: Exclude<StepId, "unlock" | "language" | "welcome">[] = [
  "drive",
  "accessMode",
  "addonPolicy",
  "complete",
];

function SetupWizardInner({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (next: Locale) => void;
}): React.ReactElement {
  const tStepper = useTranslations("setup.stepper");
  const [internalStepIndex, setInternalStepIndex] = useState(0);
  const [setupToken, setSetupToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return (new URLSearchParams(window.location.search).get("token") ?? "").trim();
  });
  // The backend seeds drives.json from the container mounts on startup,
  // so /setup begins with N detected stubs, read from the unauthenticated
  // setup-status endpoint that covers the first-run path GET /drives does not.
  const [drives, setDrives] = useState<DriveDraft[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/config/setup-status", {
          credentials: "include",
        });
        if (!res.ok) return;
        const body = await res.json();
        const detected = Array.isArray(body?.drives) ? body.drives : [];
        if (cancelled) return;
        setDrives(
          detected.map(
            (d: { name?: string; path?: string; access_group?: string }) => ({
              name: typeof d?.name === "string" ? d.name : "",
              path: typeof d?.path === "string" ? d.path : "",
              access_group:
                typeof d?.access_group === "string" ? d.access_group : "",
            }),
          ),
        );
      } catch {
        // Network failure: leave drives empty so the DriveStep shows the
        // mount guidance rather than crashing the wizard.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [accessMode, setAccessMode] = useState<AccessMode>("public");
  const [password, setPassword] = useState<PasswordDraft>({
    password: "",
    groups: [],
  });
  // Keyed by drive path: the name is still editable when the switches are pressed.
  const [addonChoices, setAddonChoices] = useState<AddonPolicy>({});
  const [addons, setAddons] = useState<AddonStatusEntry[]>([]);
  const [addonsFailed, setAddonsFailed] = useState(false);

  const loadAddons = useCallback((isCancelled: () => boolean) => {
    getAddonsStatus()
      .then((list) => {
        if (!isCancelled()) setAddons(list);
      })
      .catch(() => {
        if (!isCancelled()) setAddonsFailed(true);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAddons(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadAddons]);

  const retryAddons = useCallback(() => {
    setAddonsFailed(false);
    loadAddons(() => false);
  }, [loadAddons]);

  const addonPolicy = useMemo<AddonPolicy>(
    () =>
      Object.fromEntries(
        drives
          .filter((d) => addonChoices[d.path] !== undefined)
          .map((d) => [d.name, addonChoices[d.path]]),
      ),
    [addonChoices, drives],
  );

  const setAddonPolicy = useCallback(
    (next: AddonPolicy) => {
      setAddonChoices((prev) => ({
        ...prev,
        ...Object.fromEntries(
          drives
            .filter((d) => next[d.name] !== undefined)
            .map((d) => [d.path, next[d.name]]),
        ),
      }));
    },
    [drives],
  );

  const order = useMemo(
    () => (accessMode === "protected" ? ORDER_PROTECTED : ORDER_PUBLIC),
    [accessMode],
  );

  const stepperOrder = useMemo(
    () =>
      accessMode === "protected" ? STEPPER_PROTECTED : STEPPER_PUBLIC,
    [accessMode],
  );

  const current = order[Math.min(internalStepIndex, order.length - 1)];

  const goNext = useCallback(() => {
    setInternalStepIndex((idx) => Math.min(idx + 1, order.length - 1));
  }, [order.length]);

  const goBack = useCallback(() => {
    setInternalStepIndex((idx) => Math.max(idx - 1, 0));
  }, []);

  // Every distinct, non-empty access group across the detected drives.
  // The master password offered in PasswordStep should cover all of them
  // so a single password unlocks every protected drive.
  const groupsForPassword = useMemo(() => {
    const set = new Set<string>();
    for (const d of drives) {
      if (d.access_group.trim()) set.add(d.access_group.trim());
    }
    return Array.from(set);
  }, [drives]);

  const passwordValue = useMemo<PasswordDraft>(() => {
    if (password.groups.length === 0 && groupsForPassword.length > 0) {
      return { ...password, groups: groupsForPassword };
    }
    return password;
  }, [groupsForPassword, password]);

  const drivesForSubmit = useMemo(() => drives, [drives]);

  const driveCount = useMemo(
    () => drivesForSubmit.filter((d) => d.name.trim().length > 0).length,
    [drivesForSubmit],
  );
  const addonOnCount = useMemo(() => {
    if (addonsFailed) return null;
    let count = 0;
    for (const drv of drivesForSubmit) {
      for (const addon of addons) {
        if (isAddonOn(addonPolicy, drv.name, addon.name)) count += 1;
      }
    }
    return count;
  }, [addonPolicy, addons, addonsFailed, drivesForSubmit]);

  const summary = useMemo(
    () => ({
      driveCount: Math.max(driveCount, drivesForSubmit.length > 0 ? 1 : 0),
      accessMode,
      addonOnCount,
    }),
    [accessMode, addonOnCount, driveCount, drivesForSubmit.length],
  );

  const handleBeforeSubmit = useCallback(async () => {
    // Re-PUT drives to make sure the on-disk state matches the wizard
    // state even if the user changed something between DriveStep
    // validation and here.
    await fetch("/api/admin/config/drives", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [SETUP_TOKEN_HEADER]: setupToken,
      },
      body: JSON.stringify(drivesForSubmit),
    });

    if (accessMode === "protected" && password.password) {
      // Append the __admin__ sentinel so this password grants admin access
      // even after JWT expiry (user re-unlocks with this password → admin restored).
      const groupsWithAdmin = passwordValue.groups.includes("__admin__")
        ? passwordValue.groups
        : [...passwordValue.groups, "__admin__"];
      await fetch("/api/admin/config/passwords", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [SETUP_TOKEN_HEADER]: setupToken,
        },
        body: JSON.stringify([
          { password: password.password, groups: groupsWithAdmin },
        ]),
      });
    }

    await putAddonPolicy(addonPolicy, setupToken);

    if (accessMode === "protected" && password.password) {
      await fetch("/api/auth/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.password, remember: false }),
      });
    }
  }, [
    accessMode,
    addonPolicy,
    drivesForSubmit,
    password,
    passwordValue.groups,
    setupToken,
  ]);

  const stepperSteps = useMemo(
    () =>
      stepperOrder.map((id) => ({
        id,
        label: tStepper(id as Parameters<typeof tStepper>[0]),
      })),
    [stepperOrder, tStepper],
  );

  const stepperIndex = useMemo(() => {
    if (current === "unlock" || current === "language" || current === "welcome") {
      return -1;
    }
    const idx = stepperOrder.indexOf(
      current as Exclude<StepId, "unlock" | "language" | "welcome">,
    );
    return idx >= 0 ? idx : 0;
  }, [current, stepperOrder]);

  const showStepper = stepperIndex >= 0;
  const showHeaderSubtitle = current !== "unlock" && current !== "language";

  return (
    <SetupShell showHeaderSubtitle={showHeaderSubtitle}>
      {showStepper && (
        <div className="mt-2">
          <Stepper steps={stepperSteps} currentIndex={stepperIndex} />
        </div>
      )}
      {current === "unlock" && (
        <UnlockStep
          value={setupToken}
          onChange={setSetupToken}
          onUnlocked={goNext}
        />
      )}
      {current === "language" && (
        <LanguageStep
          value={locale}
          onChange={setLocale}
          onNext={goNext}
        />
      )}
      {current === "welcome" && (
        <WelcomeStep onNext={goNext} onBack={goBack} />
      )}
      {current === "drive" && (
        <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
          <DriveStep
            value={drives}
            onChange={setDrives}
            onNext={goNext}
            onBack={goBack}
            skipValidate
          />
        </div>
      )}
      {current === "accessMode" && (
        <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
          <AccessModeStep
            value={accessMode}
            onChange={setAccessMode}
            onNext={goNext}
            onBack={goBack}
          />
        </div>
      )}
      {current === "password" && (
        <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
          <PasswordStep
            groups={groupsForPassword}
            value={passwordValue}
            onChange={setPassword}
            onNext={goNext}
            onBack={goBack}
          />
        </div>
      )}
      {current === "addonPolicy" && (
        <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
          <AddonPolicyStep
            drives={drivesForSubmit}
            addons={addons}
            loadFailed={addonsFailed}
            onRetry={retryAddons}
            value={addonPolicy}
            onChange={setAddonPolicy}
            onNext={goNext}
            onBack={goBack}
          />
        </div>
      )}
      {current === "complete" && (
        <div className="mt-6 rounded-2xl border border-bg-border bg-bg-card p-6 sm:p-8">
          <CompleteStep
            setupToken={setupToken}
            onBack={goBack}
            onBeforeSubmit={handleBeforeSubmit}
            summary={summary}
          />
        </div>
      )}
    </SetupShell>
  );
}

const MESSAGES_BY_LOCALE = { en: enMessages, ja: jaMessages } as const;

// The app's root provider binds its messages at request time from the
// NEXT_LOCALE cookie, so a LanguageStep selection could not change the
// language of later steps within the same SPA session without this nested
// provider.
export function SetupWizard(): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    // Sync from the cookie post-mount (avoids an SSR/CSR hydration
    // mismatch) so a reload mid-wizard keeps the chosen language.
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(\w+)/);
    const cookieLocale = match?.[1];
    if (cookieLocale === "en" || cookieLocale === "ja") {
      setLocaleState(cookieLocale);
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== "undefined") {
      const oneYear = 365 * 24 * 60 * 60;
      document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${oneYear}`;
    }
  }, []);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES_BY_LOCALE[locale]}
    >
      <SetupWizardInner locale={locale} setLocale={setLocale} />
    </NextIntlClientProvider>
  );
}

export default SetupWizard;
