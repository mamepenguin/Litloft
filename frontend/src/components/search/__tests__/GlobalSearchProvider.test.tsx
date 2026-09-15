import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";

import {
  GlobalSearchProvider,
  useActiveSearchScope,
  useGlobalSearch,
  useRegisterGlobalSearch,
  useSearchScope,
  type SearchScope,
} from "../GlobalSearchProvider";

const NOTES: SearchScope = { label: "Notes", type: "text" };
const PICTURES: SearchScope = { label: "Pictures", type: "image" };

function ActiveScope() {
  const scope = useActiveSearchScope();
  return <output data-testid="active">{scope ? scope.label : "none"}</output>;
}

function Registrant({ scope }: { scope: SearchScope | null }) {
  useSearchScope(scope);
  return null;
}

const active = () => screen.getByTestId("active").textContent;

describe("GlobalSearchProvider", () => {
  it("opens the registered modal from anywhere under it", () => {
    const onOpen = vi.fn();
    function Host() {
      useRegisterGlobalSearch(onOpen);
      return null;
    }
    function Opener() {
      const search = useGlobalSearch();
      return (
        <button type="button" onClick={() => search.open()}>
          page-open
        </button>
      );
    }
    render(
      <GlobalSearchProvider>
        <Host />
        <Opener />
      </GlobalSearchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "page-open" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside a provider", () => {
    function Opener() {
      const search = useGlobalSearch();
      return (
        <button type="button" onClick={() => search.open()}>
          page-open
        </button>
      );
    }
    render(<Opener />);
    fireEvent.click(screen.getByRole("button", { name: "page-open" }));
  });

  it("has no active scope until a registrant mounts, and none after it unmounts", () => {
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
        <ActiveScope />
        <Page />
      </GlobalSearchProvider>,
    );
    expect(active()).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(active()).toBe("Notes");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(active()).toBe("none");
  });

  it.each([
    ["the later one leaves", "second", "Notes"],
    ["the earlier one leaves", "first", "Pictures"],
  ])("keeps the other registrant's scope when %s", (_, leaving, remaining) => {
    function Page() {
      const [present, setPresent] = useState({ first: true, second: true });
      return (
        <>
          {present.first && <Registrant scope={NOTES} />}
          {present.second && <Registrant scope={PICTURES} />}
          <button type="button" onClick={() => setPresent((p) => ({ ...p, [leaving]: false }))}>
            leave
          </button>
        </>
      );
    }
    render(
      <GlobalSearchProvider>
        <ActiveScope />
        <Page />
      </GlobalSearchProvider>,
    );
    expect(active()).toBe("Pictures");
    fireEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(active()).toBe(remaining);
  });

  it("registers nothing for a null scope", () => {
    render(
      <GlobalSearchProvider>
        <ActiveScope />
        <Registrant scope={null} />
      </GlobalSearchProvider>,
    );
    expect(active()).toBe("none");
  });

  it("answers with the registrant's latest scope, in its place in the stack", () => {
    const { rerender } = render(
      <GlobalSearchProvider>
        <ActiveScope />
        <Registrant scope={NOTES} />
        <Registrant scope={PICTURES} />
      </GlobalSearchProvider>,
    );
    rerender(
      <GlobalSearchProvider>
        <ActiveScope />
        <Registrant scope={{ label: "Notes, renamed", type: "text" }} />
        <Registrant scope={PICTURES} />
      </GlobalSearchProvider>,
    );
    expect(active()).toBe("Pictures");
    rerender(
      <GlobalSearchProvider>
        <ActiveScope />
        <Registrant scope={{ label: "Notes, renamed", type: "text" }} />
        <Registrant scope={{ label: "Pictures, renamed", type: "image" }} />
      </GlobalSearchProvider>,
    );
    expect(active()).toBe("Pictures, renamed");
  });
});
