import { describe, it, expect, vi } from "vitest";
import { FolderTree } from "lucide-react";
import { render, screen } from "@testing-library/react";

import { AppHeader } from "../AppHeader";

vi.mock("../TargetMenu", () => ({ TargetMenu: () => <button>Target</button> }));

function header(primaryAction?: React.ReactNode) {
  return (
    <AppHeader
      drive="main"
      icon={FolderTree}
      title="Notes"
      countDetail="3 notes"
      target={{} as never}
      actions={<button>Sort</button>}
      primaryAction={primaryAction}
    />
  );
}

describe("AppHeader", () => {
  it("passes its primary action to the header, beside the actions and the Target", () => {
    render(header(<button>New note</button>));
    for (const name of ["Sort", "Target", "New note"]) {
      expect(screen.getAllByRole("button", { name })).toHaveLength(1);
    }
  });

  it("draws no primary action when it is not given", () => {
    render(header());
    expect(screen.queryByRole("button", { name: "New note" })).toBeNull();
  });
});
