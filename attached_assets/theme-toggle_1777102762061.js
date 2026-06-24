/* ============================================================
   BMV.parts — Theme Toggle
   ============================================================
   Drop this into the root of the app (before React hydrates)
   to prevent flash-of-unstyled-content on theme.

   Usage in HTML <head> — inline, BEFORE any CSS:
   <script>{insert this file's contents}</script>

   Three modes:
     'light'  — explicit
     'dark'   — explicit
     'auto'   — follow system (default)

   Stored in localStorage as 'bmv-theme'.
   ============================================================ */

(function () {
  const STORAGE_KEY = 'bmv-theme';
  const VALID_THEMES = ['light', 'dark', 'auto'];

  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.includes(stored) ? stored : 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Apply immediately to prevent FOUC
  applyTheme(getStoredTheme());

  // Expose a global API for the toggle UI
  window.BMVTheme = {
    get current() {
      return getStoredTheme();
    },
    get resolved() {
      const t = getStoredTheme();
      if (t !== 'auto') return t;
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    },
    set(theme) {
      if (!VALID_THEMES.includes(theme)) return;
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
      applyTheme(theme);
      window.dispatchEvent(new CustomEvent('bmv-theme-change', { detail: { theme } }));
    },
    cycle() {
      // light → dark → auto → light
      const order = ['light', 'dark', 'auto'];
      const next = order[(order.indexOf(this.current) + 1) % order.length];
      this.set(next);
      return next;
    },
  };

  // React to system changes when in auto mode
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStoredTheme() === 'auto') {
        applyTheme('auto'); // re-apply to trigger any listeners
        window.dispatchEvent(new CustomEvent('bmv-theme-change', { detail: { theme: 'auto' } }));
      }
    });
  }
})();
