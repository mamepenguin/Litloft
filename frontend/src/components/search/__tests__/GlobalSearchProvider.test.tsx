import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";

import {
  GlobalSearchProvider,
  useGlobalSearch,
  useRegisterGlobalSearch,
  useSearchScope,
  type GlobalSearchOpenOptions,
  type SearchScope,
} from "../GlobalSearchProvider";

const NOTES: SearchScope = { label: "Notes", type: "text" };
const PICTURES: SearchScope = { label: "Pictures", type: "image" };

function Host({ onOpen }: { onOpen: (scope: SearchScope | null) => void }) {
  const { defaultScope } = useRegisterGlobalSearch((options?: GlobalSearchOpenOptions) =>
    onOpen(options?.scope ?? defaultScope()),
  );
  return (
    <button type="button" onClick={() => onOpen(defaultScope())}>
      header-search
    </button>
  );
}

function Registrant({ scope }: { scope: SearchScope | null }) {
  useSearchScope(scope);
  return null;
}

function Opener({ options }: { options?: GlobalSearchOpenOptions }) {
  const search = useGlobalSearch();
  return (
    <button type="button" onClick={() => search.open(options)}>
      page-open
    </button>
  );
}

describe("GlobalSearchProvider", () => {
  it("opens the registered modal from anywhere under it, with the scope passed", () => {
    const onOpen = vi.fn();
    render(
      <GlobalSearchProvider>
        <Host onOpen={onOpen} />
        <Opener options={{ scope: NOTES }} />
      </GlobalSearchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "page-open" }));
    expect(onOpen).toHaveBeenCalledWith(NOTES);
  });

  it("does nothing outside a provider", () => {
    render(<Opener options={{ scope: NOTES }} />);
    fireEvent.click(screen.getByRole("button", { name: "page-open" }));
  });

  it("has no default scope until a registrant mounts, and none after it unmounts", () => {
    const onOpen = vi.fn();
    function Page() {
      const [mounted, setMounted] = useState(false);
      return (
        <>
          {mounted && <Registrant scope={NOTES} />}
          <button type="button" onClick={() => setMounted((m) => !m)}>
            toggle
          </button>
        </>
      );
    }
    render(
      <GlobalSearchProvider>
        <Host onOpen={onOpen} />
        <Page />
      </GlobalSearchProvider>,
    );
    const header = screen.getByRole("button", { name: "header-search" });

    fireEvent.click(header);
    expect(onOpen).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    fireEvent.click(header);
    expect(onOpen).toHaveBeenLastCalledWith(NOTES);

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    fireEvent.click(header);
    expect(onOpen).toHaveBeenLastCalledWith(null);
  });

  it("keeps a registrant's scope when a later one unmounts", () => {
    const onOpen = vi.fn();
    function Page() {
      const [second, setSecond] = useState(true);
      return (
        <>
          <Registrant scope={NOTES} />
          {second && <Registrant scope={PICTURES} />}
          <button type="button" onClick={() => setSecond(false)}>
            drop-second
          </button>
        </>
      );
    }
    render(
      <GlobalSearchProvider>
        <Host onOpen={onOpen} />
        <Page />
      </GlobalSearchProvider>,
    );
    const header = screen.getByRole("button", { name: "header-search" });

    fireEvent.click(header);
    expect(onOpen).toHaveBeenLastCalledWith(PICTURES);

    fireEvent.click(screen.getByRole("button", { name: "drop-second" }));
    fireEvent.click(header);
    expect(onOpen).toHaveBeenLastCalledWith(NOTES);
  });

  it("registers nothing for a null scope", () => {
    const onOpen = vi.fn();
    render(
      <GlobalSearchProvider>
        <Host onOpen={onOpen} />
        <Registrant scope={null} />
      </GlobalSearchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "header-search" }));
    expect(onOpen).toHaveBeenLastCalledWith(null);
  });

  it("answers with the registrant's latest scope, not the one it mounted with", () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <GlobalSearchProvider>
        <Host onOpen={onOpen} />
        <Registrant scope={NOTES} />
      </GlobalSearchProvider>,
    );
    rerender(
      <GlobalSearchProvider>
        <Host onOpen={onOpen} />
        <Registrant scope={PICTURES} />
      </GlobalSearchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "header-search" }));
    expect(onOpen).toHaveBeenLastCalledWith(PICTURES);
  });
});
