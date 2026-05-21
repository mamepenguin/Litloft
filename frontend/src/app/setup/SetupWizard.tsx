"use client";

// SetupWizard: drives the first-run flow. Owns the cross-step state
// (locale, drive draft, access mode, master password, addon policy)
// and orchestrates the final submit.
//
// Step order: Language -> Welcome -> Drive -> AccessMode -> [Password] -> AddonPolicy -> Complete
// Password is skipped when access mode is "public".
// Stepper is shown for Drive..Complete only (Language/Welcome are intro screens).

import { useCallback, useEffect, useMemo, useState } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";

import enMessages from "@/messages/en.json";
import jaMessages from "@/messages/ja.json";
import { defaultLocale } from "@/i18n/config";

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
import type { AddonPolicy } from "@/lib/adminConfig";

type StepId =
  | "language"
  | "welcome"
  | "drive"
  | "accessMode"
  | "password"
  | "addonPolicy"
  | "complete";

const ORDER_PROTECTED: StepId[] = [
  "language",
  "welcome",
  "drive",
  "accessMode",
  "password",
  "addonPolicy",
  "complete",
];

const ORDER_PUBLIC: StepId[] = [
  "language",
  "welcome",
  "drive",
  "accessMode",
  "addonPolicy",
  "complete",
];

// Steps that appear in the visual Stepper. Language and Welcome are
// intentionally excluded because they are pre-progress screens.
const STEPPER_PROTECTED: Exclude<StepId, "language" | "welcome">[] = [
  "drive",
  "accessMode",
  "password",
  "addonPolicy",
  "complete",
];

const STEPPER_PUBLIC: Exclude<StepId, "language" | "welcome">[] = [
  "drive",
  "accessMode",
  "addonPolicy",
  "complete",
];

function readToggle(
  policy: AddonPolicy,
  drive: string,
  addon: string,
): boolean {
  const driveEntry = policy[drive];
  if (!driveEntry) return false;
  const value = driveEntry[addon];
  if (typeof value === "boolean") return value;
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(Boolean);
  }
  return false;
}

function SetupWizardInner({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (next: Locale) => void;
}): React.ReactElement {
  const tStepper = useTranslations("setup.stepper");
  const [internalStepIndex, setInternalStepIndex] = useState(0);
  // The backend seeds drives.json from the container mounts on startup,
  // so /setup begins with N detected stubs. We initialise the draft list
  // from GET /api/admin/config/setup-status (unauthenticated, covers the
  // first-run read path that GET /drives does not — spec §3.3, M1).
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
  const [addonPolicy, setAddonPolicy] = useState<AddonPolicy>({});

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

  // Sync the master password's groups with the detected drive groups so
  // the UI can pre-check them without further user action.
  const passwordValue = useMemo<PasswordDraft>(() => {
    if (password.groups.length === 0 && groupsForPassword.length > 0) {
      return { ...password, groups: groupsForPassword };
    }
    return password;
  }, [groupsForPassword, password]);

  // Drive list to ship to the backend on final submit.
  const drivesForSubmit = useMemo(() => drives, [drives]);

  // Summary values for the Complete step.
  const driveCount = useMemo(
    () => drivesForSubmit.filter((d) => d.name.trim().length > 0).length,
    [drivesForSubmit],
  );
  const addonOnCount = useMemo(() => {
    let count = 0;
    for (const drv of drivesForSubmit) {
      const entry = addonPolicy[drv.name];
      if (!entry) continue;
      for (const addonName of Object.keys(entry)) {
        if (readToggle(addonPolicy, drv.name, addonName)) count += 1;
      }
    }
    return count;
  }, [addonPolicy, drivesForSubmit]);

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
      headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { password: password.password, groups: groupsWithAdmin },
        ]),
      });
    }

    await fetch("/api/admin/config/addon-policy", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addonPolicy),
    });

    // Auto-unlock with the setup password so the wizard completer arrives
    // at /admin as an admin without having to unlock manually.
    if (accessMode === "protected" && password.password) {
      await fetch("/api/auth/unlock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.password, remember: false }),
      });
    }
  }, [accessMode, addonPolicy, drivesForSubmit, password, passwordValue.groups]);

  const stepperSteps = useMemo(
    () =>
      stepperOrder.map((id) => ({
        id,
        label: tStepper(id as Parameters<typeof tStepper>[0]),
      })),
    [stepperOrder, tStepper],
  );

  const stepperIndex = useMemo(() => {
    if (current === "language" || current === "welcome") return -1;
    const idx = stepperOrder.indexOf(
      current as Exclude<StepId, "language" | "welcome">,
    );
    return idx >= 0 ? idx : 0;
  }, [current, stepperOrder]);

  const showStepper = stepperIndex >= 0;
  const showHeaderSubtitle = current !== "language";

  return (
    <SetupShell showHeaderSubtitle={showHeaderSubtitle}>
      {showStepper && (
        <div className="mt-2">
          <Stepper steps={stepperSteps} currentIndex={stepperIndex} />
        </div>
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

// Outer wrapper: owns the wizard locale and supplies a client-side
// NextIntlClientProvider for the subtree. The app's root provider binds
// its messages at request time from the NEXT_LOCALE cookie, so a
// LanguageStep selection could not change the language of later steps
// within the same SPA session without this nested provider. Selecting a
// language here swaps the provider's messages and re-renders every step
// immediately (no full reload — SPA navigation policy), and the cookie
// is still written so the post-complete redirect to /admin keeps it.
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
