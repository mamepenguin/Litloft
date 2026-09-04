import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { PageHeader } from "../PageHeader";

describe("PageHeader", () => {
  describe("the heading", () => {
    it("emits an h1 when given a title", () => {
      render(<PageHeader title="Trash" />);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Trash");
    });

    // Folders and the inside of an archive name themselves in the trail. A
    // second heading repeating the last segment is one subject stated twice —
    // and it is the state that produced four h1 sizes across the app.
    it("emits no heading when the breadcrumb is the subject", () => {
      render(<PageHeader breadcrumb={<nav>Documents / 2024</nav>} />);
      expect(screen.queryByRole("heading")).toBeNull();
    });

    // DESIGN.md §3.2 now gives H1 a Size. The size living in one component is
    // the reason it can stay one value.
    it("gives the heading the single H1 size from DESIGN.md §3.2", () => {
      render(<PageHeader title="Trash" />);
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1.classList.contains("text-2xl")).toBe(true);
      const otherSizes = [...h1.classList].filter(
        (c) => /^text-(xs|sm|base|lg|xl|3xl|4xl)$/.test(c),
      );
      expect(otherSizes).toEqual([]);
    });

    it("accepts a node as the title, not only a string", () => {
      render(<PageHeader title={<input defaultValue="Q1 notes" />} />);
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1.querySelector("input")).not.toBeNull();
    });
  });

  describe("the trail row", () => {
    it("puts the leading control before the breadcrumb", () => {
      const { container } = render(
        <PageHeader
          leading={<button>Tree</button>}
          breadcrumb={<nav aria-label="Breadcrumb">Documents</nav>}
        />,
      );
      const row = container.querySelector("header > div")!;
      const order = [...row.children].map((el) => el.tagName);
      expect(order[0]).toBe("BUTTON");
      expect(order[1]).toBe("NAV");
    });

    // The tree toggle is leftmost whether or not the screen has a title, so
    // its position does not move between folder and search mode.
    it("puts the leading control on the title row when there is no trail", () => {
      const { container } = render(
        <PageHeader leading={<button>Tree</button>} title="Results" />,
      );
      const rows = container.querySelectorAll("header > div");
      expect(rows).toHaveLength(1);
      expect(rows[0].querySelector("button")?.textContent).toBe("Tree");
    });

    it("renders the leading control exactly once when both rows exist", () => {
      render(
        <PageHeader
          leading={<button>Tree</button>}
          breadcrumb={<nav>Documents</nav>}
          title="Results"
        />,
      );
      expect(screen.getAllByRole("button", { name: "Tree" })).toHaveLength(1);
    });
  });

  describe("scope and actions without a title", () => {
    // "Documents / 2024 · 138 items" reads as one subject with its measure.
    it("puts the scope on the trail row", () => {
      const { container } = render(
        <PageHeader breadcrumb={<nav>Documents</nav>} scope="138 items" />,
      );
      expect(container.querySelectorAll("header > div")).toHaveLength(1);
      expect(screen.getByText("138 items")).toBeInTheDocument();
    });

    // Rendering the trail only for `leading || breadcrumb` would drop a
    // titleless screen's actions on the floor, and nothing would say so.
    it("still renders actions when there is no breadcrumb and no title", () => {
      render(<PageHeader actions={<button>Download</button>} />);
      expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    });

    it("still renders the scope when there is no breadcrumb and no title", () => {
      render(<PageHeader scope="190 files" />);
      expect(screen.getByText("190 files")).toBeInTheDocument();
    });
  });

  describe("scope and actions with a title", () => {
    it("puts the scope under the heading", () => {
      const { container } = render(
        <PageHeader title="Missing files" scope="3 items" />,
      );
      const h1 = screen.getByRole("heading", { level: 1 });
      const scope = screen.getByText("3 items");
      expect(h1.parentElement).toBe(scope.parentElement);
      expect(container.textContent).toContain("3 items");
    });

    it("renders the scope exactly once", () => {
      render(<PageHeader breadcrumb={<nav>Drive</nav>} title="Trash" scope="1 item" />);
      expect(screen.getAllByText("1 item")).toHaveLength(1);
    });

    it("renders actions exactly once", () => {
      render(
        <PageHeader
          breadcrumb={<nav>Drive</nav>}
          title="Trash"
          actions={<button>Empty trash</button>}
        />,
      );
      expect(screen.getAllByRole("button", { name: "Empty trash" })).toHaveLength(1);
    });
  });

  describe("optional parts render nothing when omitted", () => {
    it("renders no tab row without tabs", () => {
      render(<PageHeader title="Settings" />);
      expect(screen.queryByRole("tablist")).toBeNull();
      expect(screen.queryByRole("navigation")).toBeNull();
    });

    it("renders the tabs it is given", () => {
      render(<PageHeader title="Media Import" tabs={<nav aria-label="Views" />} />);
      expect(screen.getByLabelText("Views")).toBeInTheDocument();
    });

    it("renders a bare header with nothing but a title", () => {
      const { container } = render(<PageHeader title="Settings" />);
      expect(container.querySelectorAll("header > div")).toHaveLength(1);
    });
  });

  describe("the title icon", () => {
    it("renders the icon it is given", () => {
      const { container } = render(<PageHeader titleIcon={Trash2} title="Trash" />);
      expect(container.querySelector("svg")).not.toBeNull();
    });

    // Asserting `aria-hidden` here measured lucide-react, not this component:
    // lucide adds that attribute itself whenever no a11y prop is passed, so
    // the assertion held with the component's own copy deleted. The heading's
    // accessible name is the requirement, and it fails whichever layer stops
    // hiding the icon.
    it("leaves the heading named by its text alone", () => {
      render(<PageHeader titleIcon={Trash2} title="Trash" />);
      expect(
        screen.getByRole("heading", { level: 1, name: "Trash" }),
      ).toBeInTheDocument();
    });

    it("renders no icon when none is given", () => {
      const { container } = render(<PageHeader title="Settings" />);
      expect(container.querySelector("svg")).toBeNull();
    });
  });
});
