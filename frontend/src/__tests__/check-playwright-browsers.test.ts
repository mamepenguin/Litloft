// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// SPEC-CORE-149 item 4, item 7, I4

const FRONTEND = join(__dirname, "..", "..");
const SCRIPT = join(FRONTEND, "scripts", "check-playwright-browsers.mjs");

type Entry = {
  name: string;
  revision: string;
  revisionOverrides?: Record<string, string>;
};

const BROWSERS: Entry[] = [
  { name: "chromium", revision: "1208" },
  { name: "chromium-headless-shell", revision: "1208" },
  {
    name: "webkit",
    revision: "2248",
    revisionOverrides: { "debian11-x64": "2105", "ubuntu20.04-x64": "2092" },
  },
  { name: "ffmpeg", revision: "1011", revisionOverrides: { mac12: "1010" } },
];

function installedBrowsersJson(): string {
  const fromFrontend = createRequire(join(FRONTEND, "package.json"));
  const test = fromFrontend.resolve("@playwright/test/package.json");
  const playwright = createRequire(test).resolve("playwright/package.json");
  const core = createRequire(playwright).resolve("playwright-core/package.json");
  return join(dirname(core), "browsers.json");
}

function installedDir(name: string): string {
  const { browsers } = JSON.parse(readFileSync(installedBrowsersJson(), "utf8")) as {
    browsers: Entry[];
  };
  const entry = browsers.find((b) => b.name === name);
  if (!entry) throw new Error(`${name} is not in the installed browsers.json`);
  const revision = entry.revisionOverrides?.["ubuntu24.04-x64"] ?? entry.revision;
  return `${name.replaceAll("-", "_")}-${revision}`;
}

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(browsers: Entry[] | string, dirs: string[]) {
  const root = mkdtempSync(join(tmpdir(), "pw-browsers-"));
  temps.push(root);
  const json = join(root, "browsers.json");
  writeFileSync(
    json,
    typeof browsers === "string" ? browsers : JSON.stringify({ browsers }),
  );
  const store = join(root, "ms-playwright");
  mkdirSync(store);
  for (const dir of dirs) mkdirSync(join(store, dir));
  return { root, json, store };
}

function check(
  args: string[],
  env: { PLAYWRIGHT_BROWSERS_PATH?: string },
) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.PLAYWRIGHT_BROWSERS_PATH;
  Object.assign(childEnv, env);
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: FRONTEND,
    env: childEnv,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const errors = output.split("\n").filter((line) => line.startsWith("::error::"));
  return { status: result.status, stdout: result.stdout ?? "", output, errors };
}

describe("check-playwright-browsers (SPEC-CORE-149 item 4, I4)", () => {
  it("exits zero and prints one line per directory when every build is present", () => {
    const { json, store } = fixture(BROWSERS, [
      "chromium-1208",
      "chromium_headless_shell-1208",
      "webkit-2248",
    ]);
    const run = check(
      ["--browsers-json", json, "chromium", "chromium-headless-shell", "webkit"],
      { PLAYWRIGHT_BROWSERS_PATH: store },
    );

    expect(run.status).toBe(0);
    expect(run.errors).toEqual([]);
    const lines = run.stdout.split("\n").filter((line) => line.trim() !== "");
    expect(lines).toHaveLength(3);
    for (const dir of ["chromium-1208", "chromium_headless_shell-1208", "webkit-2248"]) {
      expect(lines.filter((line) => line.includes(dir))).toHaveLength(1);
    }
  });

  it("expects every hyphen in the name as an underscore in the directory", () => {
    const { json, store } = fixture(BROWSERS, ["chromium-headless-shell-1208"]);
    const run = check(["--browsers-json", json, "chromium-headless-shell"], {
      PLAYWRIGHT_BROWSERS_PATH: store,
    });

    expect(run.status).not.toBe(0);
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toContain("chromium_headless_shell-1208");
  });

  it("uses the ubuntu24.04-x64 override when the entry has one", () => {
    const overridden = BROWSERS.map((entry) =>
      entry.name === "webkit"
        ? {
            ...entry,
            revisionOverrides: { ...entry.revisionOverrides, "ubuntu24.04-x64": "2300" },
          }
        : entry,
    );

    const atBase = fixture(overridden, ["webkit-2248"]);
    const missing = check(["--browsers-json", atBase.json, "webkit"], {
      PLAYWRIGHT_BROWSERS_PATH: atBase.store,
    });
    expect(missing.status).not.toBe(0);
    expect(missing.errors).toHaveLength(1);
    expect(missing.errors[0]).toContain("webkit-2300");

    const atOverride = fixture(overridden, ["webkit-2300"]);
    const present = check(["--browsers-json", atOverride.json, "webkit"], {
      PLAYWRIGHT_BROWSERS_PATH: atOverride.store,
    });
    expect(present.status).toBe(0);
    expect(present.errors).toEqual([]);
    expect(present.stdout).toContain("webkit-2300");
  });

  it("ignores overrides for other platforms", () => {
    const { json, store } = fixture(BROWSERS, ["webkit-2105", "webkit-2092"]);
    const run = check(["--browsers-json", json, "webkit"], {
      PLAYWRIGHT_BROWSERS_PATH: store,
    });

    expect(run.status).not.toBe(0);
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toContain("webkit-2248");
  });

  it("fails naming the missing build when one directory is absent", () => {
    const { json, store } = fixture(BROWSERS, ["chromium-1208"]);
    const run = check(["--browsers-json", json, "chromium", "chromium-headless-shell"], {
      PLAYWRIGHT_BROWSERS_PATH: store,
    });

    expect(run.status).not.toBe(0);
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toContain("chromium_headless_shell-1208");
  });

  it("prints one error line per missing directory", () => {
    const { json, store } = fixture(BROWSERS, []);
    const run = check(
      ["--browsers-json", json, "chromium", "chromium-headless-shell", "webkit"],
      { PLAYWRIGHT_BROWSERS_PATH: store },
    );

    expect(run.status).not.toBe(0);
    expect(run.errors).toHaveLength(3);
    for (const dir of ["chromium-1208", "chromium_headless_shell-1208", "webkit-2248"]) {
      expect(run.errors.filter((line) => line.includes(dir))).toHaveLength(1);
    }
  });

  it("fails when a name is not in browsers.json", () => {
    const { json, store } = fixture(BROWSERS, ["chromium-1208"]);
    const run = check(["--browsers-json", json, "chromium", "firefox-nightly"], {
      PLAYWRIGHT_BROWSERS_PATH: store,
    });

    expect(run.status).not.toBe(0);
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toContain("firefox-nightly");
  });

  it("fails when no name is given", () => {
    const { json, store } = fixture(BROWSERS, ["chromium-1208"]);
    const run = check(["--browsers-json", json], { PLAYWRIGHT_BROWSERS_PATH: store });

    expect(run.status).not.toBe(0);
    expect(run.errors.length).toBeGreaterThan(0);
  });

  it("fails when PLAYWRIGHT_BROWSERS_PATH is unset", () => {
    const { json } = fixture(BROWSERS, []);
    const run = check(["--browsers-json", json, "chromium"], {});

    expect(run.status).not.toBe(0);
    expect(run.errors.length).toBeGreaterThan(0);
    expect(run.errors.join("\n")).toContain("PLAYWRIGHT_BROWSERS_PATH");
  });

  it("fails when browsers.json does not exist", () => {
    const { root, store } = fixture(BROWSERS, ["chromium-1208"]);
    const absent = join(root, "absent", "browsers.json");
    const run = check(["--browsers-json", absent, "chromium"], {
      PLAYWRIGHT_BROWSERS_PATH: store,
    });

    expect(run.status).not.toBe(0);
    expect(run.errors.length).toBeGreaterThan(0);
    expect(run.errors.join("\n")).toContain("browsers.json");
  });

  it("fails when browsers.json is not valid JSON", () => {
    const { json, store } = fixture("{ not json", ["chromium-1208"]);
    const run = check(["--browsers-json", json, "chromium"], {
      PLAYWRIGHT_BROWSERS_PATH: store,
    });

    expect(run.status).not.toBe(0);
    expect(run.errors.length).toBeGreaterThan(0);
  });

  describe("without --browsers-json, the installed playwright-core's browsers.json", () => {
    const NAMES = ["chromium", "chromium-headless-shell", "webkit"];

    it("passes when the store holds the installed revisions", () => {
      const dirs = NAMES.map(installedDir);
      const { store } = fixture(BROWSERS, dirs);
      const run = check(NAMES, { PLAYWRIGHT_BROWSERS_PATH: store });

      expect(run.status).toBe(0);
      expect(run.errors).toEqual([]);
      for (const dir of dirs) expect(run.stdout).toContain(dir);
    });

    it("fails naming the installed revision the store lacks", () => {
      const [chromium, shell] = ["chromium", "chromium-headless-shell"].map(installedDir);
      const { store } = fixture(BROWSERS, [chromium]);
      const run = check(["chromium", "chromium-headless-shell"], {
        PLAYWRIGHT_BROWSERS_PATH: store,
      });

      expect(run.status).not.toBe(0);
      expect(run.errors).toHaveLength(1);
      expect(run.errors[0]).toContain(shell);
    });
  });
});
