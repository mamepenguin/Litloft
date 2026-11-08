import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { readShownTargets, writeShownTargets } from "@/lib/appPrefs";
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

const FOLDERS = [folder("sf-a", "Alpha", "tag:A"), folder("sf-b", "Beta", "tag:B"), folder("bad", "Broken")];

/** "Broken" stands in for a folder with a query part the app cannot use. */
const isUsable = (candidate: SmartFolder) => candidate.id !== "bad";

const onChoose = vi.fn();
const onRetryFolders = vi.fn();

function menu(overrides: Partial<React.ComponentProps<typeof TargetMenu>> = {}) {
  return (
    <TargetMenu
      drive={DRIVE}
      app="video"
      name="All videos"
      folders={{ status: "loaded", data: FOLDERS }}
      selectedId="default"
      currentCount={7}
      label="Target"
      defaultLabel="All videos"
      unavailableLabel="Not available as a target"
      defaultTargetTypes={["video"]}
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

async function openManage() {
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: /Manage/ }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  localStorage.clear();
  onChoose.mockReset();
  onRetryFolders.mockReset();
  getDriveFiles.mockReset().mockResolvedValue({ data: [], meta: { total: 12, page: 1, limit: 1 } });
});

describe("the Target menu lists the shown set", () => {
  it("lists every smart folder when nothing was ever saved, unusable ones disabled", () => {
    render(menu());
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Broken" })).toBeDisabled();
  });

  it("lists exactly the saved set's members", () => {
    writeShownTargets(DRIVE, ["sf-b"]);
    render(menu());
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("lists none for an empty saved set", () => {
    writeShownTargets(DRIVE, []);
    render(menu());
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: /All videos/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Alpha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Beta" })).not.toBeInTheDocument();
  });

  it("ignores saved ids that the drive no longer has", () => {
    writeShownTargets(DRIVE, ["sf-a", "gone"]);
    render(menu());
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "gone" })).not.toBeInTheDocument();
  });

  it("lists the current target even when the set does not hold it", async () => {
    writeShownTargets(DRIVE, ["sf-a"]);
    render(menu({ selectedId: "sf-b", name: "Beta" }));
    openMenu();

    expect(await screen.findByRole("menuitemradio", { name: "Beta" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Alpha" })).toBeInTheDocument();
  });
});

describe("Manage… and the shown set", () => {
  it("checks every usable folder when nothing was ever saved, and leaves unusable ones unchecked", async () => {
    render(menu());
    await openManage();

    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beta" })).toBeChecked();
    const broken = screen.getByRole("checkbox", { name: "Broken" });
    expect(broken).not.toBeChecked();
    expect(broken).toBeDisabled();
  });

  it("saves the usable folders with the first toggled one flipped", async () => {
    render(menu());
    await openManage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));

    await waitFor(() => expect(readShownTargets(DRIVE)).toEqual(["sf-b"]));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("starts an empty saved set unchecked and adds only the toggled folder", async () => {
    writeShownTargets(DRIVE, []);
    render(menu());
    await openManage();

    expect(screen.getByRole("checkbox", { name: "Alpha" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));

    await waitFor(() => expect(readShownTargets(DRIVE)).toEqual(["sf-a"]));
  });

  it("filters the checklist by name", async () => {
    render(menu());
    await openManage();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search smart folders" }), {
      target: { value: "alp" },
    });

    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Beta" })).not.toBeInTheDocument();
  });

  it("does not change the current target", async () => {
    writeShownTargets(DRIVE, []);
    render(menu({ selectedId: "sf-a", name: "Alpha" }));
    await openManage();
    fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }));

    await waitFor(() => expect(readShownTargets(DRIVE)).toEqual(["sf-b"]));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("reads malformed stored JSON as never saved", async () => {
    localStorage.setItem("litloft.videoApp.targets.main", "{oops");
    render(menu());
    await openManage();

    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
  });

  it("keeps a toggle for the open page when the write is refused", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      render(menu());
      await openManage();
      fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));

      await openManage();
      expect(screen.getByRole("checkbox", { name: "Alpha" })).not.toBeChecked();
      expect(readShownTargets(DRIVE)).toBeNull();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
