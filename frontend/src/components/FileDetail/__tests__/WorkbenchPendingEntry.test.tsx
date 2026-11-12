/**
 * A player-side entry whose module is still loading has had no chance to
 * answer, so the workbench must not treat its silence as available.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import {
  lazy,
  useLayoutEffect,
  type ComponentType,
  type LazyExoticComponent,
} from "react";

import type { SlotEntry, SlotModule } from "@/lib/addons";
import type { FileItem } from "@/types";
import { useSlotAvailability } from "../hooks/useSlotAvailability";
import { buildWorkbenchPanels } from "../workbench/panels";
import { Workbench } from "../workbench/Workbench";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock("../../ActiveSummaryHost", () => ({
  ActiveSummaryHost: () => null,
}));

vi.mock("../../ChaptersPanel", () => ({
  ChaptersPanel: () => null,
}));

const moduleLoader = vi.hoisted(() => ({
  load: (_addonName: string): Promise<SlotModule> =>
    Promise.reject(new Error("no module configured")),
}));

vi.mock("@/lib/addons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/addons")>();
  return {
    ...actual,
    getCachedSlotModule: () => undefined,
    loadAddonSlotModule: (addonName: string) => moduleLoader.load(addonName),
  };
});

const ENTRY: SlotEntry = {
  id: "transcript",
  label: "Transcript",
  priority: 10,
  addonName: "intelligence",
};

const FILE = { id: "f1", file_type: "video" } as FileItem;

function Host({ stored }: { stored: string[] }) {
  const availability = useSlotAvailability("f1");
  const items = buildWorkbenchPanels({
    surface: "canonical",
    hasPlayer: true,
    file: FILE,
    fileId: "f1",
    drive: "main",
    slotEntries: [ENTRY],
    availability,
    translate: (key) => key,
    addonSlotProps: {},
    mediaController: null,
    chaptersVersion: 0,
    onChaptersResolved: () => {},
  });
  return (
    <Workbench
      items={items}
      stored={stored}
      onToggle={() => {}}
      onClose={() => {}}
    />
  );
}

function Silent() {
  return <div data-testid="silent-entry" />;
}

function AnswersFalse({
  onAvailability,
}: {
  onAvailability?: (available: boolean) => void;
}) {
  useLayoutEffect(() => {
    onAvailability?.(false);
  }, [onAvailability]);
  return <div data-testid="answers-false-entry" />;
}

function moduleWith(
  component:
    | ComponentType<Record<string, unknown>>
    | LazyExoticComponent<ComponentType<Record<string, unknown>>>,
): SlotModule {
  return {
    slotComponents: { transcript: component },
  } as unknown as SlotModule;
}

/**
 * A slot component shaped like production's: `React.lazy` over a chunk the
 * test releases by hand.
 */
function gatedLazy(component: ComponentType<Record<string, unknown>>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const Lazy = lazy(() => gate.then(() => ({ default: component })));
  return { Lazy, release };
}

let resolveModule: (mod: SlotModule) => void;

beforeEach(() => {
  moduleLoader.load = () =>
    new Promise<SlotModule>((resolve) => {
      resolveModule = resolve;
    });
});

const panelGroup = () =>
  screen.queryByRole("group", { name: "workbench.panels" });

const shownTranscript = () =>
  screen.queryAllByRole("region", { name: "Transcript" });

describe("a player-side entry whose module is still loading", () => {
  it("has no toggle and no panel, even with its id stored", () => {
    render(<Host stored={["transcript"]} />);

    expect(panelGroup()).toBeNull();
    expect(shownTranscript()).toHaveLength(0);
  });

  it("gets its toggle and its panel from silence once its component renders", async () => {
    render(<Host stored={["transcript"]} />);
    expect(panelGroup()).toBeNull();

    await act(async () => {
      resolveModule(moduleWith(Silent));
    });

    expect(screen.getByTestId("silent-entry")).toBeInTheDocument();
    await waitFor(() => expect(panelGroup()).not.toBeNull());
    expect(
      screen.getByRole("button", { name: "Transcript" }),
    ).toBeInTheDocument();
    expect(shownTranscript()).toHaveLength(1);
  });

  it("is never listed or shown when it answers false before paint", async () => {
    render(<Host stored={["transcript"]} />);
    expect(panelGroup()).toBeNull();
    expect(shownTranscript()).toHaveLength(0);

    await act(async () => {
      resolveModule(moduleWith(AnswersFalse));
    });
    await waitFor(() =>
      expect(screen.getByTestId("answers-false-entry")).toBeInTheDocument(),
    );

    expect(panelGroup()).toBeNull();
    expect(shownTranscript()).toHaveLength(0);
  });
});

describe("a player-side entry whose lazy chunk is still loading", () => {
  it("has no toggle and no panel while the chunk is unresolved", async () => {
    const { Lazy } = gatedLazy(Silent);
    render(<Host stored={["transcript"]} />);

    await act(async () => {
      resolveModule(moduleWith(Lazy));
    });

    expect(screen.queryByTestId("silent-entry")).toBeNull();
    expect(panelGroup()).toBeNull();
    expect(shownTranscript()).toHaveLength(0);
  });

  it("gets its toggle and its panel from silence once the chunk resolves", async () => {
    const { Lazy, release } = gatedLazy(Silent);
    render(<Host stored={["transcript"]} />);

    await act(async () => {
      resolveModule(moduleWith(Lazy));
    });
    expect(panelGroup()).toBeNull();

    await act(async () => {
      release();
    });

    expect(screen.getByTestId("silent-entry")).toBeInTheDocument();
    await waitFor(() => expect(panelGroup()).not.toBeNull());
    expect(
      screen.getByRole("button", { name: "Transcript" }),
    ).toBeInTheDocument();
    expect(shownTranscript()).toHaveLength(1);
  });

  it("is never listed when it answers false before paint", async () => {
    const { Lazy, release } = gatedLazy(AnswersFalse);
    render(<Host stored={["transcript"]} />);

    await act(async () => {
      resolveModule(moduleWith(Lazy));
    });
    expect(panelGroup()).toBeNull();
    expect(shownTranscript()).toHaveLength(0);

    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(screen.getByTestId("answers-false-entry")).toBeInTheDocument(),
    );

    expect(panelGroup()).toBeNull();
    expect(shownTranscript()).toHaveLength(0);
  });
});
