import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams("view=inbox"),
}));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/player/hooks/usePointerMode", () => ({
  usePointerMode: () => "fine" as const,
}));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/FileContextMenu", () => ({ FileContextMenu: () => null }));
vi.mock("@/components/inbox/useInboxStages", () => ({
  useInboxStages: () => ({}),
}));
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: (p: {
    selectedIds: Set<string>;
    onSelectOnly?: (ids: string[]) => void;
    onProcessed?: (ids: string[]) => void;
  }) => (
    <div data-testid="selection-bar" data-selected={Array.from(p.selectedIds).join(",")}>
      <button onClick={() => p.onSelectOnly?.(["b", "c"])}>select b c</button>
      <button onClick={() => p.onSelectOnly?.(["b"])}>select b</button>
      <button onClick={() => p.onProcessed?.(["b"])}>processed b</button>
    </div>
  ),
}));

const inbox = vi.hoisted(() => ({ initial: ["a", "b", "c"] as string[] }));

vi.mock("@/components/inbox/useInboxData", async () => {
  const React = await import("react");
  return {
    useInboxData: () => {
      const [items, setItems] = React.useState(() =>
        inbox.initial.map((id) => ({
          file: {
            id,
            filename: `${id}.mp4`,
            title: `Arrival ${id}`,
            file_type: "video",
            mime_type: "video/mp4",
            folder_path: "",
            has_thumbnail: false,
          },
          arrived_at: "2026-11-17T10:00:00Z",
          source: "upload",
          source_i18n_key: "inbox.sourceUpload",
        })),
      );
      const settle = React.useCallback((ids: readonly string[]) => {
        const gone = new Set(ids);
        setItems((previous) => previous.filter((item) => !gone.has(item.file.id)));
      }, []);
      return {
        items,
        visibleItems: items,
        openCount: items.length,
        loading: false,
        loadingMore: false,
        sentinelRef: { current: null },
        reload: vi.fn(),
        hide: vi.fn(),
        restoreHidden: vi.fn(),
        settle,
      };
    },
  };
});

import { InboxView } from "@/components/inbox/InboxView";

function selectFirstRow() {
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
}

describe("SPEC-CORE-120 I21: the inbox holds the ids a batch run could not process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inbox.initial = ["a", "b", "c"];
  });

  it("I21 [SPEC-CORE-120] onSelectOnly replaces the selection with exactly the ids passed", () => {
    render(<InboxView driveName="main" />);
    selectFirstRow();
    expect(screen.getByTestId("selection-bar")).toHaveAttribute("data-selected", "a");

    fireEvent.click(screen.getByRole("button", { name: "select b c" }));
    expect(screen.getByTestId("selection-bar")).toHaveAttribute("data-selected", "b,c");

    fireEvent.click(screen.getByRole("button", { name: "select b" }));
    expect(screen.getByTestId("selection-bar")).toHaveAttribute("data-selected", "b");
  });

  it("I21 [SPEC-CORE-120] onProcessed removes the processed rows from the list", async () => {
    render(<InboxView driveName="main" />);
    selectFirstRow();

    fireEvent.click(screen.getByRole("button", { name: "processed b" }));

    await waitFor(() => expect(screen.queryByText("Arrival b")).not.toBeInTheDocument());
    expect(screen.getByText("Arrival a")).toBeInTheDocument();
    expect(screen.getByText("Arrival c")).toBeInTheDocument();
  });
});
