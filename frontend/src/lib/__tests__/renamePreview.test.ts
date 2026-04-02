import { describe, it, expect } from "vitest";
import { computeNewFilenames, isValidRegex } from "../renamePreview";

const files = [
  { id: "1", filename: "photo_a.jpg" },
  { id: "2", filename: "photo_b.jpg" },
  { id: "3", filename: "document.pdf" },
];

describe("computeNewFilenames", () => {
  describe("template mode", () => {
    it("applies default template", () => {
      const result = computeNewFilenames(files, "template", {});
      expect(result[0]).toMatchObject({ newName: "photo_a_001.jpg", changed: true });
      expect(result[1]).toMatchObject({ newName: "photo_b_002.jpg", changed: true });
      expect(result[2]).toMatchObject({ newName: "document_003.pdf", changed: true });
    });

    it("uses custom template and start number", () => {
      const result = computeNewFilenames(files, "template", {
        template: "img_{n}",
        startNumber: 10,
        zeroPad: 2,
      });
      expect(result[0].newName).toBe("img_10.jpg");
      expect(result[1].newName).toBe("img_11.jpg");
      expect(result[2].newName).toBe("img_12.pdf");
    });

    it("replaces multiple {original} placeholders", () => {
      const result = computeNewFilenames(files.slice(0, 1), "template", {
        template: "{original}_{original}",
        startNumber: 1,
        zeroPad: 1,
      });
      expect(result[0].newName).toBe("photo_a_photo_a.jpg");
    });
  });

  describe("regex mode", () => {
    it("replaces matching pattern", () => {
      const result = computeNewFilenames(files, "regex", {
        pattern: "photo",
        replacement: "image",
      });
      expect(result[0].newName).toBe("image_a.jpg");
      expect(result[1].newName).toBe("image_b.jpg");
      expect(result[2]).toMatchObject({ newName: "document.pdf", changed: false });
    });

    it("supports capture groups", () => {
      const result = computeNewFilenames(files.slice(0, 1), "regex", {
        pattern: "(photo)_(\\w)",
        replacement: "$2_$1",
      });
      expect(result[0].newName).toBe("a_photo.jpg");
    });

    it("returns original when no pattern", () => {
      const result = computeNewFilenames(files, "regex", {
        pattern: "",
        replacement: "x",
      });
      expect(result.every((r) => !r.changed)).toBe(true);
    });
  });

  describe("prefix_suffix mode", () => {
    it("adds prefix", () => {
      const result = computeNewFilenames(files, "prefix_suffix", {
        action: "add_prefix",
        value: "new_",
      });
      expect(result[0].newName).toBe("new_photo_a.jpg");
    });

    it("adds suffix", () => {
      const result = computeNewFilenames(files, "prefix_suffix", {
        action: "add_suffix",
        value: "_v2",
      });
      expect(result[0].newName).toBe("photo_a_v2.jpg");
    });

    it("removes prefix", () => {
      const result = computeNewFilenames(files, "prefix_suffix", {
        action: "remove_prefix",
        value: "photo_",
      });
      expect(result[0].newName).toBe("a.jpg");
      expect(result[1].newName).toBe("b.jpg");
      expect(result[2]).toMatchObject({ newName: "document.pdf", changed: false });
    });

    it("removes suffix", () => {
      const result = computeNewFilenames(files, "prefix_suffix", {
        action: "remove_suffix",
        value: "_a",
      });
      expect(result[0].newName).toBe("photo.jpg");
      expect(result[1]).toMatchObject({ newName: "photo_b.jpg", changed: false });
    });

    it("returns original when no value", () => {
      const result = computeNewFilenames(files, "prefix_suffix", {
        action: "add_prefix",
        value: "",
      });
      expect(result.every((r) => !r.changed)).toBe(true);
    });
  });

  describe("extension handling", () => {
    it("preserves extension", () => {
      const result = computeNewFilenames(
        [{ id: "1", filename: "file.tar.gz" }],
        "template",
        { template: "renamed_{n}" }
      );
      expect(result[0].newName).toBe("renamed_001.gz");
    });

    it("handles files without extension", () => {
      const result = computeNewFilenames(
        [{ id: "1", filename: "Makefile" }],
        "prefix_suffix",
        { action: "add_prefix", value: "old_" }
      );
      expect(result[0].newName).toBe("old_Makefile");
    });

    it("handles dot-files", () => {
      const result = computeNewFilenames(
        [{ id: "1", filename: ".gitignore" }],
        "prefix_suffix",
        { action: "add_suffix", value: "_bak" }
      );
      // .gitignore has no extension (dot at index 0)
      expect(result[0].newName).toBe(".gitignore_bak");
    });
  });
});

describe("isValidRegex", () => {
  it("returns true for valid patterns", () => {
    expect(isValidRegex("hello")).toBe(true);
    expect(isValidRegex("\\d+")).toBe(true);
    expect(isValidRegex("(a|b)")).toBe(true);
  });

  it("returns false for invalid patterns", () => {
    expect(isValidRegex("[invalid")).toBe(false);
    expect(isValidRegex("(unclosed")).toBe(false);
  });
});
