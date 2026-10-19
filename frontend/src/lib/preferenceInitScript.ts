/**
 * The media layout a reader gets before they have chosen one.
 *
 * Lives here, in the module with no `"use client"`, because both the
 * server-injected script below and the client hook in `mediaLayout.ts`
 * need it and the dependency can only point this way.
 */
export const DEFAULT_MEDIA_LAYOUT = "beside";

export const NON_DEFAULT_MEDIA_LAYOUT = "stacked";

/**
 * Keep it dependency-free and ES5, since it executes before any bundle does.
 *
 * **Reading storage is the only thing inside the `try`.** A browser
 * configured to block site data throws on `localStorage.getItem`, and an
 * unguarded throw here skips *both* `setAttribute` calls.
 */
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
