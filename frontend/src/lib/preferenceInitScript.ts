/**
 * The script that stamps display preferences onto `<html>` before the
 * first paint.
 *
 * Both preferences are acted on entirely in CSS from an attribute, so
 * reading them in an effect would paint the other value for a frame and
 * then shift. That is the whole reason this runs inline and ahead of
 * React.
 *
 * It lives here rather than inline in `layout.tsx` so it can be run
 * against a hostile `localStorage` in a test. It is a string because it
 * is injected with `dangerouslySetInnerHTML`; keep it dependency-free
 * and ES5, since it executes before any bundle does.
 *
 * **Reading storage is the only thing inside the `try`.** A browser
 * configured to block site data throws on `localStorage.getItem` — not
 * on access, on the call — and an unguarded throw here skips *both*
 * `setAttribute` calls. That used to be survivable by accident: with no
 * attribute, the CSS fell back to the same defaults the JS assumed, so
 * the two agreed. Since `data-media-layout` began defaulting to
 * `beside` (2026-09) they no longer do — CSS renders the stacked form
 * while `useMediaLayoutPreference` reports beside, so the layout toggle
 * appears to do nothing until it is pressed twice. Narrowing the `try`
 * to the reads keeps the attributes being written whatever storage
 * does, and leaves `prefers-color-scheme` still deciding the theme.
 */
/**
 * The media layout a reader gets before they have chosen one.
 *
 * Lives here, in the module with no `"use client"`, because both the
 * server-injected script below and the client hook in `mediaLayout.ts`
 * need it and the dependency can only point this way. Four separate
 * literals used to encode it — this string, `normalise`, that module's
 * SSR guard and its hook's initial state — and only two of the four were
 * pinned by any test. One constant makes the drift unrepresentable
 * instead of merely detectable.
 */
export const DEFAULT_MEDIA_LAYOUT = "beside";

/** The only other value; anything else normalises to the default. */
export const NON_DEFAULT_MEDIA_LAYOUT = "stacked";

export const PREFERENCE_INIT_SCRIPT = `
(function(){
  var theme = 'system';
  var layout = null;
  try {
    theme = localStorage.getItem('theme-preference') || 'system';
    layout = localStorage.getItem('media-layout-preference');
  } catch (e) {
    // Site data is blocked. Both fall through to their defaults below,
    // which is exactly what a first-time visitor gets.
  }

  // Written first, and from the one constant both sides share. This is
  // the attribute whose CSS fallback does NOT match its JS default, so
  // it is the one that must not be skipped by anything throwing later.
  document.documentElement.setAttribute(
    'data-media-layout',
    layout === '${NON_DEFAULT_MEDIA_LAYOUT}'
      ? '${NON_DEFAULT_MEDIA_LAYOUT}'
      : '${DEFAULT_MEDIA_LAYOUT}'
  );

  // \`matchMedia\` is not inside the try above — it is not storage — so
  // guard the call rather than assume it. A theme that falls back to
  // light is a much smaller loss than an attribute never written.
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  var resolved = theme === 'light' || theme === 'dark'
    ? theme
    : (mq && mq.matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', resolved);
})();
`;
