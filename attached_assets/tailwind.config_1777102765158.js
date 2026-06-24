/* ============================================================
   BMV.parts — Tailwind Config
   ============================================================
   Drop into tailwind.config.js. Pairs with bmv-tokens.css for
   CSS-variable-based theming (so dark mode just works).

   Strategy: define every color as `hsl(var(--token))` style
   so theme switching happens at the CSS layer, not in JS.
   ============================================================ */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './client/src/**/*.{ts,tsx,js,jsx}',
    './client/index.html',
  ],

  // Dark mode driven by data-theme attribute on <html>
  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Tight', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },

      colors: {
        // Surface scale
        'surface': {
          DEFAULT: 'var(--surface-base)',
          raised:  'var(--surface-raised)',
          sunken:  'var(--surface-sunken)',
          quiet:   'var(--surface-quiet)',
        },

        // Sidebar (always dark, even in light mode)
        'sidebar': {
          DEFAULT: 'var(--surface-sidebar)',
          raised:  'var(--surface-sidebar-raised)',
          line:    'var(--surface-sidebar-line)',
        },

        // Foreground / ink scale
        'ink': {
          DEFAULT:   'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          tertiary:  'var(--fg-tertiary)',
          quiet:     'var(--fg-quiet)',
          inverse:   'var(--fg-inverse)',
        },

        // Borders
        'border-default': 'var(--border-default)',
        'border-strong':  'var(--border-strong)',
        'border-ink':     'var(--border-ink)',

        // Brand accent
        'accent': {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          fog:     'var(--accent-fog)',
          on:      'var(--accent-on-accent)',
        },

        // States
        'success': {
          DEFAULT: 'var(--state-success)',
          fog:     'var(--state-success-fog)',
        },
        'signal': {
          DEFAULT: 'var(--state-signal)',
          fog:     'var(--state-signal-fog)',
        },
        'error': {
          DEFAULT: 'var(--state-error)',
          fog:     'var(--state-error-fog)',
        },

        // Brand fixed colors (don't shift with theme)
        'brand-blue':        '#1563D6',
        'brand-blue-bright': '#4F94F0',
        'brand-blue-deep':   '#0B3E8A',
      },

      // Hard-edged radius scale — keep things engineered
      borderRadius: {
        none: '0',
        sm:   '2px',
        DEFAULT: '2px',
        // No md/lg/xl — explicitly not allowed in this design system
      },

      // Letter spacing matching the tokens
      letterSpacing: {
        'mono':    '0.04em',
        'label':   '0.14em',
        'tight':   '-0.01em',
        'tighter': '-0.025em',
        'display': '-0.04em',
      },

      // Box shadows — only the hero CTA shadow + floating menu shadow exist
      boxShadow: {
        'hero':       '4px 4px 0 var(--border-ink)',
        'hero-hover': '5px 5px 0 var(--border-ink)',
        'floating':   'var(--shadow-floating)',
        'none':       'none',
      },

      // Animation timing
      transitionTimingFunction: {
        'ease-out-quart': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        'fast': '120ms',
        'base': '180ms',
        'slow': '280ms',
      },

      // Type scale
      fontSize: {
        // Aligned with token values
        'xs':      ['11px',   { lineHeight: '1.4',  letterSpacing: '0.04em' }],
        'sm':      ['12.5px', { lineHeight: '1.5' }],
        'base':    ['14px',   { lineHeight: '1.55' }],
        'md':      ['15px',   { lineHeight: '1.55' }],
        'lg':      ['17px',   { lineHeight: '1.4' }],
        'xl':      ['20px',   { lineHeight: '1.35' }],
        '2xl':     ['24px',   { lineHeight: '1.2',  letterSpacing: '-0.01em' }],
        '3xl':     ['32px',   { lineHeight: '1.1',  letterSpacing: '-0.025em' }],
        '4xl':     ['44px',   { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        '5xl':     ['64px',   { lineHeight: '1',    letterSpacing: '-0.04em' }],
        'display': ['96px',   { lineHeight: '0.95', letterSpacing: '-0.045em' }],
      },
    },
  },

  plugins: [],
}
