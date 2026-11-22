// Apply the saved theme before first paint so the page does not flash.
// A separate file, not an inline script, so the Content-Security-Policy can
// allow scripts from this site only.
try {
  const saved = localStorage.getItem('procureguard-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch {
  // Storage can be blocked (private mode, strict settings); the default theme applies.
}
