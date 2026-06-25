import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useLocalizedHref } from "@/lib/locale";

// Heuristic router for the universal search input. Matches the spec
// from `attached_assets/BMV-BRAND-SPEC_1777102499878.md` (Task #69):
//
//   17-character VIN  →  /vin-decoder/:vin   (canonical: /vin/:vin)
//   /^[EFG]\d{2}$/i   →  /chassis/:code
//   anything else     →  /search?q=…
//
// VIN regex avoids characters that cannot appear in a VIN (I, O, Q).
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
const CHASSIS_RE = /^[EFG]\d{2,3}$/i;

export function routeForQuery(raw: string): string | null {
  const q = raw.trim();
  if (!q) return null;
  if (VIN_RE.test(q)) return `/vin/${q.toUpperCase()}`;
  if (CHASSIS_RE.test(q)) return `/chassis/${q.toUpperCase()}`;
  return `/search?q=${encodeURIComponent(q)}`;
}

interface Props {
  className?: string;
  variant?: "topbar" | "hero";
  autoFocus?: boolean;
  /** Override the placeholder copy (the hero uses the long-form helper). */
  placeholder?: string;
  /** Hero variant uses a CTA button + Decode label; topbar shows the ⌘K hint. */
  cta?: string;
}

export function UniversalSearch({ className = "", variant = "topbar", autoFocus, placeholder, cta }: Props) {
  const [location, navigate] = useLocation();
  const searchString = useSearch();
  const localize = useLocalizedHref();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  const isOnSearchPage = location === "/search" || location.endsWith("/search");
  const urlQ = isOnSearchPage ? (new URLSearchParams(searchString).get("q") ?? "") : "";
  const [value, setValue] = useState(urlQ);

  useEffect(() => {
    if (!isOnSearchPage) return;
    const q = new URLSearchParams(searchString).get("q") ?? "";
    setValue(q);
  }, [searchString, isOnSearchPage]);

  // ⌘K / Ctrl-K focuses the topbar search from anywhere in the app.
  // The hero variant skips this so the two inputs don't fight over focus.
  useEffect(() => {
    if (variant !== "topbar") return;
    function handler(e: KeyboardEvent) {
      const isShortcut = (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
      if (!isShortcut) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [variant]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const dest = routeForQuery(value);
    if (!dest) return;
    navigate(localize(dest));
  }

  if (variant === "hero") {
    return (
      <form
        onSubmit={submit}
        className={"bmv-hero-cta flex items-stretch w-full max-w-[640px] " + className}
        data-testid="form-hero-search"
      >
        <Search className="self-center ml-4 w-4 h-4 text-ink-tertiary" aria-hidden />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? t.hero.placeholder}
          className="flex-1 bg-transparent border-0 outline-none px-3 py-3.5 text-base font-mono placeholder:text-ink-quiet"
          data-testid="input-hero-search"
          aria-label={placeholder ?? t.hero.placeholder}
        />
        <button
          type="submit"
          className="px-5 bg-ink-primary text-ink-inverse font-medium text-sm tracking-tight hover:bg-[#1563D6] transition-colors"
          data-testid="button-hero-decode"
        >
          {cta ?? t.hero.decode}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={"flex items-center w-full max-w-[540px] border border-border bg-card hover:border-ink-tertiary focus-within:border-ink-primary transition-colors " + className}
      data-testid="form-topbar-search"
    >
      <Search className="ml-2.5 w-3.5 h-3.5 text-ink-quiet" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t.topbar.universalPlaceholder}
        className="flex-1 bg-transparent border-0 outline-none px-2 py-1.5 text-sm font-mono placeholder:text-ink-quiet"
        data-testid="input-topbar-search"
        aria-label={t.topbar.universalPlaceholder}
      />
      <span className="hidden sm:inline-flex items-center mr-2 px-1.5 py-0.5 text-[10px] font-mono text-ink-quiet border border-border" aria-hidden>
        {t.topbar.universalShortcut}
      </span>
    </form>
  );
}
