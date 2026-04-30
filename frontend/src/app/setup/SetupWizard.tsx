"use client";

// SetupWizard: drives the first-run flow. Owns the cross-step state
// (locale, drive draft, access mode, master password, addon policy)
// and orchestrates the final submit.
//
// Step order: Language -> Welcome -> Drive -> AccessMode -> [Password] -> AddonPolicy -> Complete
// Password is skipped when access mode is "public".
// Stepper is shown for Drive..Complete only (Language/Welcome are intro screens).

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

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

export function SetupWizard(): React.ReactElement {
  const tStepper = useTranslations("setup.stepper");
  const [internalStepIndex, setInternalStepIndex] = useState(0);
  const [locale, setLocaleState] = useState<Locale>("ja");

  // Persist locale to the NEXT_LOCALE cookie so next-intl picks it up
  // immediately (the wizard re-renders) and after the post-complete
  // redirect to /admin. Without this the LanguageStep selection silently
  // drops on the cookie boundary.
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== "undefined") {
      const oneYear = 365 * 24 * 60 * 60;
      document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${oneYear}`;
    }
  }, []);
  const [drive, setDrive] = useState<DriveDraft>({
    name: "",
    path: "",
    access_group: "",
  });
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

  // Sync the master password's groups with the drive group so the UI can
  // pre-check it without further user action.
  const passwordValue = useMemo<PasswordDraft>(() => {
    if (password.groups.length === 0 && drive.access_group) {
      return { ...password, groups: [drive.access_group] };
    }
    return password;
  }, [drive.access_group, password]);

  const groupsForPassword = useMemo(() => {
    const set = new Set<string>();
    if (drive.access_group) set.add(drive.access_group);
    return Array.from(set);
  }, [drive.access_group]);

  // Drive list to ship to the backend on final submit. The wizard
  // currently collects exactly one drive entry — keep this as a list for
  // future expansion.
  const drivesForSubmit = useMemo(() => [drive], [drive]);

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
      await fetch("/api/admin/config/passwords", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { password: password.password, groups: passwordValue.groups },
        ]),
      });
    }

    await fetch("/api/admin/config/addon-policy", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addonPolicy),
    });
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
            value={drive}
            onChange={setDrive}
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

export default SetupWizard;
