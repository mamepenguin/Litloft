/**
 * Keep it dependency-free and ES5, since it executes before any bundle does.
 *
 * **Reading storage is the only thing inside the `try`.** A browser
 * configured to block site data throws on `localStorage.getItem`, and an
 * unguarded throw here skips the `setAttribute` below.
 */
export const PREFERENCE_INIT_SCRIPT = `
(function(){
  var theme = 'system';
  try {
    theme = localStorage.getItem('theme-preference') || 'system';
  } catch (e) {
    // Site data is blocked: fall through to the system theme below.
  }

  // \`matchMedia\` is not inside the try above — it is not storage — so
  // guard the call rather than assume it.
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  var resolved = theme === 'light' || theme === 'dark'
    ? theme
    : (mq && mq.matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', resolved);
})();
`;
