import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useT } from "@/lib/i18n";

// Window-level API exposed by the inline theme-toggle script in
// client/index.html. The script reads/writes localStorage under
// `bmv-theme` and toggles the `data-theme` attribute on <html>.
declare global {
  interface Window {
    BMVTheme?: {
      readonly current: "light" | "dark" | "auto";
      readonly resolved: "light" | "dark";
      set(theme: "light" | "dark" | "auto"): void;
      cycle(): "light" | "dark" | "auto";
    };
  }
}

export type ThemeMode = "light" | "dark" | "auto";

function readMode(): ThemeMode {
  if (typeof window === "undefined" || !window.BMVTheme) return "auto";
  return window.BMVTheme.current;
}

/**
 * Hook returning the current BMV theme + a setter. The underlying
 * state is owned by the inline script in <head> so reads on first
 * paint reflect the persisted preference (no FOUC).
 */
export function useBmvTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readMode());

  useEffect(() => {
    const handler = () => setMode(readMode());
    window.addEventListener("bmv-theme-change", handler as EventListener);
    return () => window.removeEventListener("bmv-theme-change", handler as EventListener);
  }, []);

  return {
    mode,
    resolved: typeof window !== "undefined" && window.BMVTheme ? window.BMVTheme.resolved : "light",
    cycle: () => window.BMVTheme?.cycle(),
    set: (m: ThemeMode) => window.BMVTheme?.set(m),
  };
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, cycle } = useBmvTheme();
  const t = useT();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const labelMap = {
    light: t.themeToggle.light,
    dark: t.themeToggle.dark,
    auto: t.themeToggle.auto,
  } as const;
  const label = labelMap[mode];

  return (
    <button
      type="button"
      onClick={() => cycle()}
      title={t.themeToggle.title(label)}
      aria-label={t.themeToggle.title(label)}
      className={
        "inline-flex h-7 w-7 items-center justify-center text-ink-tertiary hover:text-ink-primary transition-colors focus:outline-none " +
        className
      }
      data-testid="button-theme-toggle"
      data-theme-mode={mode}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
