import { transformResource } from "./sanitize.js";
import {
  OWN_ROOT_ATTR,
  OWN_ROOT_VAR,
  edgeAction,
  flattenToc,
  gapFor,
  isHttpUrl,
  isValidOpen,
  isValidSeek,
  readTypography,
  keyAction,
  restoreAnchor,
  swipeAction,
  typographyCss,
} from "./core.js";

const parentWindow = window.parent;
const origin = location.origin;
const TAP_SLOP_PX = 10;
const POINTER_ACTIVITY_MS = 250;

const post = (type, payload = {}) => {
  if (parentWindow !== window) parentWindow.postMessage({ type, ...payload }, origin);
};

// A policy without 'unsafe-eval' makes the Function constructor throw, and one
// without 'unsafe-inline' leaves an inserted inline script unrun. That the
// policy is the reader's own is held where the header is built.
const cspIsActive = () => {
  try {
    new Function("return 1");
    return false;
  } catch {
    // expected under the policy
  }
  window.__epubInlineProbe = false;
  const inline = document.createElement("script");
  inline.textContent = "window.__epubInlineProbe = true";
  document.head.append(inline);
  inline.remove();
  return window.__epubInlineProbe === false;
};

const state = {
  view: null,
  progress: null,
  lastRelocate: null,
  fullscreen: false,
  turning: false,
  opened: false,
  ready: false,
  tocHrefs: [],
  pendingSeek: null,
  lastPointerActivity: 0,
  theme: "light",
  typography: readTypography(null),
  pendingTypography: null,
  // The place the reader chose (a move, the restore, a seek), kept apart from
  // the places a reflow lands on, which start a little earlier each time.
  readingPlace: null,
  restyling: false,
};

const THEMES = {
  light: { fg: "#1f1f1f", bg: "#ffffff", link: "#1d4ed8" },
  dark: { fg: "#e6e6e6", bg: "#161616", link: "#93c5fd" },
};

const themeCss = (name) => {
  const t = THEMES[name];
  return `
    html { color-scheme: ${name}; }
    html, body { background: ${t.bg} !important; color: ${t.fg} !important; }
    a:link, a:visited { color: ${t.link} !important; }
  `;
};

const restyle = () => {
  const renderer = state.view?.renderer;
  if (!renderer) return;
  renderer.setStyles?.(themeCss(state.theme) + typographyCss(state.typography));
  // foliate re-lays out on every set, even of the same value.
  const gap = gapFor(state.typography.margin);
  if (renderer.getAttribute("gap") !== gap) renderer.setAttribute("gap", gap);
};

const applyTheme = (name) => {
  state.theme = name;
  document.documentElement.style.background = THEMES[name].bg;
  restyle();
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// Not a reader action: it posts no turn, and moves wait for it.
const applyTypography = async (t) => {
  state.typography = t;
  state.turning = true;
  state.restyling = true;
  try {
    restyle();
    await nextFrame();
    const place = state.readingPlace;
    if (place) await state.view.renderer.goTo({ index: place.index, anchor: place.range });
    await nextFrame();
  } finally {
    state.restyling = false;
    state.turning = false;
  }
  drainPending();
};

const drainPending = () => {
  if (state.pendingTypography !== null) {
    const t = state.pendingTypography;
    state.pendingTypography = null;
    applyTypography(t).catch(() => {});
    return;
  }
  if (state.pendingSeek !== null) runPendingSeek();
};

const locationKey = (loc) => (loc ? `${loc.index}:${loc.fraction}` : "");

const startFraction = () => {
  const loc = state.lastRelocate;
  if (!loc || !state.progress) return null;
  return state.progress.getProgress(loc.index, loc.fraction ?? 0, 0).fraction;
};

const postLocation = () => {
  const fraction = startFraction();
  if (!state.ready || fraction === null) return;
  const { renderer } = state.view;
  const id = state.view.lastLocation?.tocItem?.id;
  post("location", {
    fraction,
    tocIndex: Number.isInteger(id) && id < state.tocHrefs.length ? id : null,
    pagesLeft: renderer.pages > 2 ? Math.max(0, renderer.pages - 2 - renderer.page) : null,
  });
};

// Every reader action goes through here; restore and reflow do not.
const turn = async (move) => {
  if (!state.view || state.turning) return;
  state.turning = true;
  const before = locationKey(state.lastRelocate);
  try {
    await move(state.view);
  } finally {
    state.turning = false;
  }
  if (locationKey(state.lastRelocate) !== before)
    post("turned", { fraction: startFraction(), atEnd: !!state.view.renderer.atEnd });
  drainPending();
};

const MOVES = {
  next: (v) => v.next(),
  prev: (v) => v.prev(),
  left: (v) => v.goLeft(),
  right: (v) => v.goRight(),
};

const onKeyDown = (e) => {
  if (state.fullscreen) post("activity", { kind: "key" });
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const action = keyAction(e.key, { shift: e.shiftKey, fullscreen: state.fullscreen });
  if (!action) return;
  e.preventDefault();
  if (action.turn) turn(MOVES[action.turn]);
  else post("key", { key: action.forward });
};

// The paginator's own touch handling is stopped at the window so that every
// page turn is one of ours.
const installTouch = (win) => {
  let start = null;
  const stop = (e) => e.stopImmediatePropagation();
  win.addEventListener("touchstart", (e) => {
    stop(e);
    const t = e.changedTouches[0];
    start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  win.addEventListener("touchmove", stop, { capture: true, passive: true });
  win.addEventListener("touchend", (e) => {
    stop(e);
    const t = e.changedTouches[0];
    const from = start;
    start = null;
    // Pinch zoom happens on the page that holds the reader, not in it.
    const zoom = (parentWindow.visualViewport ?? window.visualViewport)?.scale ?? 1;
    if (!from || !t || zoom > 1) return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    const swipe = swipeAction(dx, dy);
    if (swipe) {
      turn(MOVES[swipe]);
      return;
    }
    if (!state.fullscreen || Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) return;
    if (e.target?.closest?.("a[href]")) return;
    const selection = win.document.getSelection?.();
    if (selection && !selection.isCollapsed) return;
    // A section document is laid out as one wide multi-column frame, so its
    // own coordinates are not screen positions.
    const x = t.clientX + (win.frameElement?.getBoundingClientRect().left ?? 0);
    const edge = edgeAction(x, window.innerWidth);
    if (edge) turn(MOVES[edge]);
    else post("activity", { kind: "tap" });
  }, { capture: true });
};

const installPointer = (win) => {
  win.addEventListener("pointermove", (e) => {
    if (!state.fullscreen || e.pointerType === "touch") return;
    const now = performance.now();
    if (now - state.lastPointerActivity < POINTER_ACTIVITY_MS) return;
    state.lastPointerActivity = now;
    post("activity", { kind: "pointer" });
  }, { passive: true });
};

const firstLinearIndex = (book) => {
  const i = book.sections.findIndex((s) => s.linear !== "no");
  return i < 0 ? 0 : i;
};

const restore = async (fraction, section = null) => {
  const { view, progress } = state;
  if (Number.isInteger(section) && section >= 0 && section < view.book.sections.length) {
    await view.renderer.goTo({ index: section, anchor: 0 });
    return;
  }
  if (fraction === null || fraction <= 0 || fraction >= 1) {
    await view.renderer.goTo({ index: firstLinearIndex(view.book), anchor: 0 });
    return;
  }
  const [index, inSection] = progress.getSection(fraction);
  await view.renderer.goTo({
    index,
    anchor: () => restoreAnchor(inSection, view.renderer.pages),
  });
};

const lastLinearIndex = (book) => {
  for (let i = book.sections.length - 1; i >= 0; i--) if (book.sections[i].linear !== "no") return i;
  return book.sections.length - 1;
};

// The same landing as a restore, so that a seek and reopening at the saved
// fraction show the same page.
const seekTarget = (fraction) => {
  const { view, progress } = state;
  if (fraction <= 0) return { index: firstLinearIndex(view.book), anchor: 0 };
  if (fraction >= 1) return { index: lastLinearIndex(view.book), anchor: 1 };
  const [index, inSection] = progress.getSection(fraction);
  return { index, anchor: () => restoreAnchor(inSection, view.renderer.pages) };
};

// A seek that arrives mid-turn waits for it; only the latest one is kept.
// Each seek that runs is answered, even when it lands on the page already
// shown and so reports no turn.
const runPendingSeek = () => {
  if (state.turning || state.pendingSeek === null) return;
  const { fraction, id } = state.pendingSeek;
  state.pendingSeek = null;
  turn((v) => v.renderer.goTo(seekTarget(fraction)))
    .finally(() => post("seeked", { id }))
    .catch(() => {});
};

// The fractions are the ones positions are reported in, so a chapter's
// first page and the chapter's entry compare equal.
const buildToc = (view) => {
  try {
    const resolveIndex = (href) => view.resolveNavigation(href)?.index ?? null;
    return flattenToc(view.book.toc, resolveIndex, state.progress.sectionFractions);
  } catch {
    return { entries: [], hrefs: [] };
  }
};

const openBook = async ({ bytes, fraction, section, theme, typography }) => {
  state.theme = theme;
  state.typography = readTypography(typography);
  const [{ makeBook }, { SectionProgress }] = await Promise.all([
    import("./vendor/view.js"),
    import("./vendor/progress.js"),
  ]);
  const file = new File([bytes], "book.epub", { type: "application/epub+zip" });
  const book = await makeBook(file);
  if (!book.transformTarget || book.rendition?.layout === "pre-paginated") {
    post("error", { code: "unsupported" });
    return;
  }
  book.transformTarget.addEventListener("data", (e) => transformResource(e.detail));

  const view = document.createElement("foliate-view");
  view.addEventListener("external-link", (e) => {
    e.preventDefault();
    if (isHttpUrl(e.detail.href)) post("link", { url: e.detail.href });
  });
  view.addEventListener("link", (e) => {
    e.preventDefault();
    const href = e.detail.href;
    turn((v) => v.goTo(href));
  });
  view.addEventListener("load", (e) => {
    const win = e.detail.doc.defaultView;
    if (!win) return;
    // foliate's column count applies to a horizontal book on a wide screen
    // (a spread) and to a vertical book on a tall one, where it would stack
    // two pages on top of each other; only the first is wanted.
    const root = e.detail.doc.documentElement;
    if (root) {
      // Read with the scaling rule off, so the size is always the book's own.
      root.removeAttribute(OWN_ROOT_ATTR);
      root.style.setProperty(OWN_ROOT_VAR, win.getComputedStyle(root).fontSize);
      root.setAttribute(OWN_ROOT_ATTR, "");
    }
    const body = e.detail.doc.body;
    const vertical = !!body && win.getComputedStyle(body).writingMode.startsWith("vertical");
    const columns = vertical ? "1" : "2";
    if (view.renderer.getAttribute("max-column-count") !== columns)
      view.renderer.setAttribute("max-column-count", columns);
    win.addEventListener("keydown", onKeyDown);
    installTouch(win);
    installPointer(win);
  });
  document.body.append(view);
  await view.open(book);
  state.view = view;
  state.progress = new SectionProgress(book.sections, 1500, 1600);
  // Registered after the view's own listener, so the view's tocItem is
  // already this location's.
  view.renderer.addEventListener("relocate", (e) => {
    state.lastRelocate = e.detail;
    if (!state.restyling && e.detail.reason !== "anchor" && e.detail.range)
      state.readingPlace = { index: e.detail.index, range: e.detail.range };
    postLocation();
  });
  view.renderer.setAttribute("margin", "32px");
  applyTheme(theme);

  await restore(fraction, section);

  const doc = view.renderer.getContents?.()[0]?.doc;
  const writingMode = doc?.body ? doc.defaultView.getComputedStyle(doc.body).writingMode : "";
  const toc = buildToc(view);
  state.tocHrefs = toc.hrefs;
  post("ready", {
    dir: book.dir === "rtl" ? "rtl" : "ltr",
    vertical: writingMode.startsWith("vertical"),
    toc: toc.entries,
  });
  state.ready = true;
  postLocation();
};

window.addEventListener("message", (e) => {
  if (e.origin !== origin || e.source !== parentWindow) return;
  const d = e.data;
  if (!d || typeof d !== "object") return;
  switch (d.type) {
    case "open":
      if (state.opened || !isValidOpen(d)) return;
      state.opened = true;
      if (!cspIsActive()) {
        post("error", { code: "isolation" });
        return;
      }
      openBook(d).catch(() => post("error", { code: "parse" }));
      return;
    case "turn":
      if (Object.hasOwn(MOVES, d.direction)) turn(MOVES[d.direction]);
      return;
    case "seek":
      if (!state.ready || !isValidSeek(d)) return;
      state.pendingSeek = { fraction: d.fraction, id: d.id };
      runPendingSeek();
      return;
    case "typography": {
      if (!state.ready) return;
      const t = readTypography(d.typography);
      if (state.turning) state.pendingTypography = t;
      else applyTypography(t).catch(() => {});
      return;
    }
    case "theme":
      if (d.theme === "light" || d.theme === "dark") applyTheme(d.theme);
      return;
    case "mode":
      if (typeof d.fullscreen === "boolean") state.fullscreen = d.fullscreen;
      return;
  }
});

document.addEventListener("keydown", onKeyDown);
installTouch(window);
installPointer(window);
post("boot");
