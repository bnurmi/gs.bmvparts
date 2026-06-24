import type { Config } from "tailwindcss";

export default {
  // Dark mode driven by data-theme="dark" on <html> (BMV theme toggle).
  // Keep the legacy `.dark` class match too so any utility classes still
  // referencing `dark:` continue to resolve in lockstep.
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // Hard-edged radius — capped at 2px per BMV spec. Keep the
      // legacy aliases (lg/md/sm) so existing components don't crash,
      // but they all resolve to the same crisp 2px or smaller.
      borderRadius: {
        lg: "2px",
        md: "2px",
        sm: "1px",
      },
      colors: {
        // ---------- Legacy shadcn aliases (HSL-driven) ----------
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        // shadcn `accent` is the generic neutral hover / dropdown
        // active fill — NOT the BMV brand blue. The brand blue lives
        // on `bmv` below so it never accidentally bleeds through
        // shadcn primitives that opted into `accent` for hover state.
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)",
        },
        status: {
          online: "var(--state-success)",
          away: "var(--state-signal)",
          busy: "var(--state-error)",
          offline: "var(--fg-quiet)",
        },

        // ---------- BMV brand scales (token-driven, not HSL) ----------
        surface: {
          DEFAULT: "var(--surface-base)",
          base: "var(--surface-base)",
          raised: "var(--surface-raised)",
          sunken: "var(--surface-sunken)",
          quiet: "var(--surface-quiet)",
          sidebar: "var(--surface-sidebar)",
        },
        ink: {
          DEFAULT: "var(--fg-primary)",
          primary: "var(--fg-primary)",
          secondary: "var(--fg-secondary)",
          tertiary: "var(--fg-tertiary)",
          quiet: "var(--fg-quiet)",
          inverse: "var(--fg-inverse)",
        },
        bmv: {
          DEFAULT: "var(--accent)",
          accent: "var(--accent)",
          hover: "var(--accent-hover)",
          fog: "var(--accent-fog)",
          on: "var(--accent-on-accent)",
        },
        success: {
          DEFAULT: "var(--state-success)",
          fog: "var(--state-success-fog)",
        },
        signal: {
          DEFAULT: "var(--state-signal)",
          fog: "var(--state-signal-fog)",
        },
        error: {
          DEFAULT: "var(--state-error)",
          fog: "var(--state-error-fog)",
        },
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        "border-ink": "var(--border-ink)",
      },
      fontFamily: {
        sans: ["Inter Tight", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
        // `serif` retained as a Tailwind alias only — the BMV system
        // does not actually use serifs anywhere. Aliases default to
        // Inter Tight so any stray `font-serif` class still renders.
        serif: ["Inter Tight", "system-ui", "sans-serif"],
      },
      fontSize: {
        // BMV type scale (mirrors tokens). Standard Tailwind aliases
        // (xs/sm/base/lg/xl/2xl/3xl/4xl/5xl) are kept so existing
        // components don't break, just with adjusted line heights and
        // tighter tracking on the larger sizes.
        xs: ["11px", { lineHeight: "1.4", letterSpacing: "0.04em" }],
        sm: ["12.5px", { lineHeight: "1.5" }],
        base: ["14px", { lineHeight: "1.55" }],
        md: ["15px", { lineHeight: "1.55" }],
        lg: ["17px", { lineHeight: "1.4" }],
        xl: ["20px", { lineHeight: "1.35" }],
        "2xl": ["24px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "3xl": ["32px", { lineHeight: "1.1", letterSpacing: "-0.025em" }],
        "4xl": ["44px", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "5xl": ["64px", { lineHeight: "1", letterSpacing: "-0.04em" }],
        display: ["96px", { lineHeight: "0.95", letterSpacing: "-0.045em" }],
      },
      letterSpacing: {
        mono: "0.04em",
        label: "0.14em",
        tight: "-0.01em",
        tighter: "-0.025em",
        display: "-0.04em",
      },
      boxShadow: {
        // Two blessed shadows in the BMV system. Everything else
        // collapses to none.
        hero: "4px 4px 0 var(--border-ink)",
        "hero-hover": "5px 5px 0 var(--border-ink)",
        floating: "var(--shadow-floating)",
      },
      transitionTimingFunction: {
        "ease-out-quart": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        slow: "280ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
