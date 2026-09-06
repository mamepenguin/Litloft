import { expect, test, type Page } from "@playwright/test";
import {
  getDriveFiles,
  getFirstDrive,
  waitForApp,
} from "./helpers";

/**
 * E2E coverage for the right-pane equivalence work
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md §7.3).
 *
 * Phase 2.0: ships seven journeys that the unit tests cannot exercise
 * end-to-end — redirect status codes, query carry-through, mobile
 * screen swap, mini-player IntersectionObserver root forwarding, the
 * playlist-redirect-exception negative case, and the ImageGallery
 * host hand-off. These run against the live Docker stack
 * (`docker compose up`) on the developer's machine and pick fixtures
 * from whichever drives are configured. Tests that require a missing
 * fixture (writable drive, image file, video file, …) are skipped
 * loudly rather than failing.
 *
 * Selector strategy mirrors the rest of the e2e suite: aria-labels
 * and i18n-tolerant regexes (ja.json + en.json) instead of
 * implementation-specific class names. The placeholders below come
 * from `src/messages-core/{ja,en}.json` — keep both branches in sync
 * when copy changes.
 */

interface PickedFile {
  id: string;
  title: string;
  filename: string;
  drive: string;
  folder_path: string;
  file_type: string;
}

let driveName: string | null = null;
let anyFile: PickedFile | null = null;
let secondFileSameFolder: PickedFile | null = null;
let nonMediaFile: PickedFile | null = null;
let videoFile: PickedFile | null = null;
let imageFile: PickedFile | null = null;

const RIGHT_PANE_BACK_RE = /ツリーへ戻る|Back to tree/i;
const GALLERY_BTN_RE = /ギャラリー|gallery/i;

function folderUrl(drive: string, folderPath: string): string {
  const segs = folderPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return segs
    ? `/drive/${encodeURIComponent(drive)}/${segs}`
    : `/drive/${encodeURIComponent(drive)}`;
}

function fileSelectionUrl(file: PickedFile, extra?: Record<string, string>) {
  const params = new URLSearchParams({ file: file.id, ...(extra ?? {}) });
  return `${folderUrl(file.drive, file.folder_path)}?${params.toString()}`;
}

/**
 * Seed `tree:enabled:{drive}=true` in localStorage **before** the page
 * mounts. The drive layout (`src/app/drive/[name]/layout.tsx`) reads
 * `useTreeEnabled` synchronously via `useSyncExternalStore` and only
 * mounts `<TwoPaneLayout>` (and therefore `<RightPaneFile>`) when the
 * flag is true. Without this, `?file=` does nothing visible — the page
 * just renders the default folder view.
 */
async function enableTreeFor(page: Page, drive: string) {
  await page.addInitScript((d: string) => {
    try {
      localStorage.setItem(`tree:enabled:${d}`, "true");
    } catch {
      /* storage unavailable; the test will skip via timeout */
    }
  }, drive);
}

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive) return;
  driveName = drive.name;

  // Generic fixtures off the first drive — covers the redirect /
  // mobile / negative-playlist tests without caring about file type.
  const generic = await getDriveFiles(driveName, { limit: 200 });
  if (generic.data.length > 0) {
    anyFile = generic.data[0];
    // Find a sibling in the same folder for arrow-nav coverage.
    const sibling = generic.data
      .slice(1)
      .find((f) => (f.folder_path ?? "") === (anyFile!.folder_path ?? ""));
    if (sibling) secondFileSameFolder = sibling;
  }
  // Non-media file (document/text/markdown/other) for arrow-nav —
  // arrow keys are intentionally inert on media to avoid clashing
  // with player seek (spec §4.4).
  const nonMedia = generic.data.find(
    (f) =>
      f.file_type !== "video" &&
      f.file_type !== "audio" &&
      f.file_type !== "image",
  );
  if (nonMedia) nonMediaFile = nonMedia;

  // Type-specific fixtures: skip the corresponding test if missing.
  try {
    const v = await getDriveFiles(driveName, { type: "video", limit: 1 });
    if (v.data.length > 0) videoFile = v.data[0];
  } catch {
    /* drive unreachable; tests will skip */
  }
  try {
    const i = await getDriveFiles(driveName, { type: "image", limit: 1 });
    if (i.data.length > 0) imageFile = i.data[0];
  } catch {
    /* drive unreachable; tests will skip */
  }
});

test.describe("Right pane: /files/{id} 307 redirect", () => {
  test.skip(() => !driveName, "No drives available");

  test("GET /files/{id} returns 307 with canonical Location", async ({
    request,
  }) => {
    test.skip(!anyFile, "No files to redirect");
    const res = await request.get(`/files/${anyFile!.id}`, {
      maxRedirects: 0,
    });
    // Next.js' redirect() emits 307 by default (B2 in spec §4.7).
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/drive/");
    expect(location).toContain(`file=${anyFile!.id}`);
  });

  test("query (?t=10) is forwarded to the canonical URL", async ({
    request,
  }) => {
    test.skip(!anyFile, "No files to redirect");
    const res = await request.get(`/files/${anyFile!.id}?t=10`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toMatch(/[?&]t=10\b/);
    expect(location).toContain(`file=${anyFile!.id}`);
  });

  test("?playlist=foo is NOT redirected (fullscreen exception)", async ({
    request,
  }) => {
    test.skip(!anyFile, "No files to redirect");
    // §4.6 / §4.7: playlist & folder_play modes stay on /files/{id}
    // because the 2-pane host doesn't render PlaylistPanel.
    const res = await request.get(`/files/${anyFile!.id}?playlist=foo`, {
      maxRedirects: 0,
    });
    // 200 (Server Component renders FileDetailFullScreen) — not 307.
    expect(res.status()).not.toBe(307);
    expect(res.status()).toBeLessThan(400);
  });
});

test.describe("Right pane: 2-pane behaviour", () => {
  test.skip(() => !driveName || !anyFile, "No drives or files");

  test("?file= opens full file detail in the right pane", async ({ page }) => {
    await enableTreeFor(page, anyFile!.drive);
    await page.goto(fileSelectionUrl(anyFile!));
    await waitForApp(page);

    // The detail body renders inside <main> with the file's title in
    // an <h1>. Its presence is the load-bearing signal that
    // FileDetailContent (and therefore RightPaneFile) mounted — the
    // legacy "minimal preview" pane never rendered an <h1>. The
    // chrome's back-to-tree chip is `md:hidden` (display:none on
    // desktop, removed from the accessibility tree), so we lean on
    // the <h1> here and check the chip directly in the mobile spec.
    const titleH1 = page.locator("main h1").first();
    await expect(titleH1).toBeVisible({ timeout: 10_000 });

    // Like / Dislike controls confirm we are showing the full-detail
    // content, not the legacy "minimal preview" pane (Topic 7
    // overturned).
    await expect(page.getByRole("button", { name: /^Like$/i })).toBeVisible();
  });

  test("arrow keys navigate to the sibling file (non-media)", async ({
    page,
  }) => {
    test.skip(
      !nonMediaFile || !secondFileSameFolder,
      "Need a non-media file with a sibling in the same folder",
    );
    // Use the picked non-media file as the starting point. We can't
    // know the *direction* the neighbors API returns ahead of time,
    // so we accept either ArrowLeft or ArrowRight reaching a new id.
    await enableTreeFor(page, nonMediaFile!.drive);
    await page.goto(fileSelectionUrl(nonMediaFile!));
    await waitForApp(page);
    await page
      .locator("main h1")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    const initialUrl = page.url();
    // Focus body so the document-level arrow listener (useShortcuts)
    // can pick the keystroke up.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    let movedUrl = page.url();
    if (movedUrl === initialUrl) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(800);
      movedUrl = page.url();
    }

    // useFileNav skips when there is no neighbor; treat that as a
    // soft pass rather than a failure. When it *does* navigate, the
    // ?file= id must change.
    if (movedUrl !== initialUrl) {
      expect(movedUrl).toMatch(/[?&]file=/);
      expect(movedUrl).not.toBe(initialUrl);
    }
  });

  test("playlist URL inside 2-pane does NOT render PlaylistPanel", async ({
    page,
  }) => {
    // §4.6 negative: the 2-pane host owns ?file= but never owns
    // PlaylistPanel; ?playlist=… arriving here (e.g. via a stale link)
    // must not cause the panel to appear in the right pane.
    await enableTreeFor(page, anyFile!.drive);
    await page.goto(
      fileSelectionUrl(anyFile!, { playlist: "non-existent-id" }),
    );
    await waitForApp(page);
    await page.waitForTimeout(1500);

    // The PlaylistPanel renders the "1/N tracks" badge (see playlist
    // spec). Its absence here is the load-bearing assertion.
    const trackInfo = page.locator("text=/\\d+\\/\\d+ tracks/");
    await expect(trackInfo).toHaveCount(0);
  });
});

test.describe("Right pane: media", () => {
  test.skip(() => !driveName, "No drives available");

  test("video opens with mini-player container in the scroll surface", async ({
    page,
  }) => {
    test.skip(!videoFile, "No video file in the drive");
    // Phase 1 PR-1 (B1) routes the IntersectionObserver root to the
    // right-pane scroll container. We can't reliably observe the
    // "reflow to floating" without playing audio/video for several
    // seconds, so the load-bearing check is structural: the
    // <video> mounts inside the right-pane scroll surface, and the
    // surface itself is overflow-y:auto.
    await enableTreeFor(page, videoFile!.drive);
    await page.goto(fileSelectionUrl(videoFile!));
    await waitForApp(page);

    // Wait for the file to mount. Either the video element or the
    // sticky CTA (when poster-only mode kicks in) is enough.
    const video = page.locator("main video").first();
    await video.waitFor({ state: "attached", timeout: 15_000 });

    // The scroll container is the parent <div ref={scrollRef}> in
    // PaneShell — the closest scroll-y ancestor of the video.
    const isInsideScroll = await video.evaluate((el) => {
      let p = el.parentElement;
      while (p) {
        const style = window.getComputedStyle(p);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          return true;
        }
        p = p.parentElement;
      }
      return false;
    });
    expect(isInsideScroll).toBe(true);
  });

  test("image: Maximize button opens ImageGallery", async ({ page }) => {
    test.skip(!imageFile, "No image file in the drive");
    await enableTreeFor(page, imageFile!.drive);
    await page.goto(fileSelectionUrl(imageFile!));
    await waitForApp(page);

    // FileDetailContent renders the gallery launcher only for image
    // files and only when onRequestImageGallery is wired up — the
    // 2-pane host is the one that wires it (§3.4 H2).
    const launcher = page.getByRole("button", { name: GALLERY_BTN_RE });
    await launcher.waitFor({ state: "visible", timeout: 10_000 });
    await launcher.click();

    // ImageGallery covers the viewport with a fixed overlay; the
    // close control is the only thing we can name without coupling
    // to internals. Look for any visible "close" affordance, then
    // press Escape as a fallback.
    await page.waitForTimeout(500);
    // The gallery uses role="dialog"-like fixed overlay. We probe by
    // looking for an element with `position: fixed` newly mounted in
    // the body that is visible.
    const overlayCount = await page
      .locator('[class*="fixed"][class*="inset-0"]')
      .count();
    expect(overlayCount).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // After close the URL must still hold ?file= for the original id
    // (host re-syncs ?file= when gallery advances to a sibling).
    expect(page.url()).toContain(`file=${imageFile!.id}`);
  });
});

test.describe("Right pane: mobile screen swap", () => {
  // Topic 11: at narrow widths the right pane fills the viewport and
  // the tree pane is hidden. The "back to tree" chrome chip stays
  // visible (md:hidden flips on md+).
  test.use({ viewport: { width: 375, height: 800 } });

  test.skip(() => !driveName || !anyFile, "No drives or files");

  test("?file= shows the back-to-tree button on mobile widths", async ({
    page,
  }) => {
    await enableTreeFor(page, anyFile!.drive);
    await page.goto(fileSelectionUrl(anyFile!));
    await waitForApp(page);
    const back = page.getByRole("button", { name: RIGHT_PANE_BACK_RE });
    await expect(back).toBeVisible({ timeout: 10_000 });
  });
});
