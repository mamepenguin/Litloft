/** SPEC-ADDON-106: the Target menu under an addon app key written inline. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { SmartFolder } from "@/types/smartFolder";
import { TargetMenu } from "../TargetMenu";

const DRIVE = "main";

const getDriveFiles = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
}));

function folder(id: string, name: string, query = ""): SmartFolder {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

const FOLDERS = [folder("sf-a", "Alpha", "tag:A"), folder("sf-b", "Beta", "tag:B")];
const LOADED = { status: "loaded" as const, data: FOLDERS };
const isUsable = () => true;

/** The default row's count is requested only while a smart folder is the current target. */
const ON_A_FOLDER = { selectedId: "sf-a", name: "Alpha" } as const;

const onChoose = vi.fn();
const onRetryFolders = vi.fn();

type Props = React.ComponentProps<typeof TargetMenu>;

/** Every call builds new `app` and `defaultTargetTypes` values, as an inline JSX prop would. */
function menu(overrides: Partial<Props> = {}) {
  return (
    <TargetMenu
      drive={DRIVE}
      app={{ addon: "pd" }}
      name="All photos"
      folders={LOADED}
      selectedId="default"
      currentCount={7}
      label="Target"
      defaultLabel="All photos"
      unavailableLabel="Not available as a target"
      defaultTargetTypes={["image"]}
      isUsable={isUsable}
      onChoose={onChoose}
      onRetryFolders={onRetryFolders}
      {...overrides}
    />
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Target/ }));
}

function openManage() {
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: /Manage/ }));
  return screen.getByRole("dialog");
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  localStorage.clear();
  onChoose.mockReset();
  onRetryFolders.mockReset();
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 12, page: 1, limit: 1 } });
});

describe("SPEC-ADDON-106 I8 the Target menu with an inline addon key", () => {
  it("SPEC-ADDON-106 saves the shown set under the addon's own key", async () => {
    render(menu());
    openManage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));

    await waitFor(() =>
      expect(localStorage.getItem("litloft.addon.pd.targets.main")).toBe('["sf-b"]'),
    );
    expect(localStorage.getItem("litloft.videoApp.targets.main")).toBeNull();
    expect(localStorage.getItem("litloft.readingApp.targets.main")).toBeNull();
  });

  it("SPEC-ADDON-106 lists the addon's saved shown set", () => {
    localStorage.setItem("litloft.addon.pd.targets.main", '["sf-b"]');
    render(menu());
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("SPEC-ADDON-106 requests the default count once while the open menu re-renders", async () => {
    const { rerender } = render(menu(ON_A_FOLDER));
    openMenu();
    await settle();

    for (let i = 0; i < 5; i += 1) {
      rerender(menu(ON_A_FOLDER));
      await settle();
    }

    expect(getDriveFiles).toHaveBeenCalledTimes(1);
  });

  it("SPEC-ADDON-106 requests the default count again when defaultTargetTypes changes value", async () => {
    const { rerender } = render(menu(ON_A_FOLDER));
    openMenu();
    await settle();
    rerender(menu(ON_A_FOLDER));
    await settle();
    expect(getDriveFiles).toHaveBeenCalledTimes(1);

    rerender(menu({ ...ON_A_FOLDER, defaultTargetTypes: ["video"] }));
    await settle();

    expect(getDriveFiles).toHaveBeenCalledTimes(2);
  });

  it("SPEC-ADDON-106 keeps a toggle the storage refused across a re-render", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      const { rerender } = render(menu());
      openManage();
      fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));

      rerender(menu());
      await settle();
      rerender(menu());
      await settle();

      openMenu();
      expect(screen.queryByRole("menuitemradio", { name: "Alpha" })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitemradio", { name: "Beta" })).toBeInTheDocument();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("SPEC-ADDON-106 reads the other addon's shown set when the name changes", async () => {
    localStorage.setItem("litloft.addon.pd2.targets.main", '["sf-b"]');
    const { rerender } = render(menu());
    rerender(menu({ app: { addon: "pd2" } }));
    await settle();
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("SPEC-ADDON-106 reads apart \"video\" and { addon: \"video\" }", async () => {
    localStorage.setItem("litloft.videoApp.targets.main", '["sf-a"]');
    localStorage.setItem("litloft.addon.video.targets.main", '["sf-b"]');
    const { rerender } = render(menu({ app: "video" }));
    openMenu();
    expect(screen.queryByRole("menuitemradio", { name: "Beta" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    rerender(menu({ app: { addon: "video" } }));
    await settle();
    if (!screen.queryByRole("menuitemradio", { name: "Alpha" })) openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("SPEC-ADDON-106 a shown set saved for Video hides nothing for an addon", () => {
    localStorage.setItem("litloft.videoApp.targets.main", "[]");
    localStorage.setItem("litloft.addon.pd.targets.main", '["sf-a"]');
    render(menu());
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Beta" })).not.toBeInTheDocument();
  });
});
