/** SPEC-CORE-044 I10: the collection header hosts a ``collection-actions`` slot. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const slotProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const slotCalls = vi.hoisted(() => ({ all: [] as Record<string, unknown>[] }));

vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: (props: Record<string, unknown>) => {
    slotCalls.all.push(props);
    slotProps.current = props;
    return <div data-testid="collection-actions-slot" />;
  },
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
}));

vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({
    fileId: null,
    selectFile: vi.fn(),
    clearFile: vi.fn(),
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getCollection: vi.fn().mockResolvedValue({
    id: "c1",
    name: "読書メモ",
    description: null,
    drive: "main",
    items: [],
    created_at: "",
    updated_at: "",
  }),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  reorderCollectionItems: vi.fn(),
  removeCollectionItem: vi.fn(),
}));

vi.mock("@/components/folder/TwoPaneLayout", () => ({
  TwoPaneLayout: ({
    children,
    leftPane,
  }: {
    children: React.ReactNode;
    leftPane?: React.ReactNode;
  }) => (
    <>
      <aside>{leftPane}</aside>
      <section>{children}</section>
    </>
  ),
}));

vi.mock("@/components/CollectionItemsPane", () => ({
  CollectionItemsPane: () => <div />,
}));
vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button type="button">tree</button>,
}));

import { CollectionDetail } from "../CollectionDetail";

beforeEach(() => {
  slotCalls.all = [];
  slotProps.current = null;
  mockPush.mockClear();
});

describe("SPEC-CORE-044 the collection-actions slot", () => {
  it("draws the slot stacked in the header with the collection's identity", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);

    await waitFor(() =>
      expect(screen.getByTestId("collection-actions-slot")).toBeInTheDocument(),
    );

    const props = slotCalls.all.find((call) => call.id === "collection-actions");
    expect(props).toMatchObject({
      id: "collection-actions",
      layout: "stack",
      props: {
        drive: "main",
        collectionId: "c1",
        collectionName: "読書メモ",
      },
    });
  });
});
