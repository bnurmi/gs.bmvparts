// Frontend locale helpers. Mirrors the SUPPORTED_LOCALES list in
// shared/i18n/types.ts but kept tiny here so the client doesn't pull the
// full server-side pack code into the bundle. Used by PartDetail to derive
// the active locale from the URL prefix and emit hreflang links.

import { useLocation } from "wouter";

export interface ClientLocale {
  code: string;       // BCP-47 code, e.g. "de-DE"
  prefix: string;     // URL prefix segment, e.g. "de" or "" for English root
  bcp47: string;      // identical to code in this app, kept separate for symmetry
  nativeLabel: string;
}

// Order matters in two places:
//  1) Display order in the language switcher (English first as default).
//  2) Prefix matching in `splitLocaleFromPath` — longer prefixes (es-mx,
//     en-za, pt-br) must be checked before shorter ones (es, en, pt).
export const CLIENT_LOCALES: ClientLocale[] = [
  { code: "en",    prefix: "",      bcp47: "en",    nativeLabel: "English" },
  { code: "de-DE", prefix: "de",    bcp47: "de-DE", nativeLabel: "Deutsch" },
  { code: "fr-FR", prefix: "fr",    bcp47: "fr-FR", nativeLabel: "Français" },
  { code: "es-ES", prefix: "es",    bcp47: "es-ES", nativeLabel: "Español" },
  { code: "it-IT", prefix: "it",    bcp47: "it-IT", nativeLabel: "Italiano" },
  { code: "zh-CN", prefix: "zh",    bcp47: "zh-CN", nativeLabel: "简体中文" },
  { code: "ko-KR", prefix: "ko",    bcp47: "ko-KR", nativeLabel: "한국어" },
  { code: "es-MX", prefix: "es-mx", bcp47: "es-MX", nativeLabel: "Español (México)" },
  { code: "en-ZA", prefix: "en-za", bcp47: "en-ZA", nativeLabel: "English (ZA)" },
  { code: "pt-BR", prefix: "pt-br", bcp47: "pt-BR", nativeLabel: "Português (BR)" },
  { code: "ru-RU", prefix: "ru",    bcp47: "ru-RU", nativeLabel: "Русский" },
];

const PREFIXES_LONGEST_FIRST = [...CLIENT_LOCALES]
  .filter(l => l.prefix !== "")
  .sort((a, b) => b.prefix.length - a.prefix.length);

// Extract a locale prefix (if any) from a wouter `useLocation()` path. Returns
// the resolved locale plus the path with the prefix stripped (for canonical
// URL/breadcrumb construction). Defaults to English when no prefix is present.
export function splitLocaleFromPath(path: string): { locale: ClientLocale; pathWithoutLocale: string } {
  const trimmed = path.replace(/^\/+/, "");
  for (const loc of PREFIXES_LONGEST_FIRST) {
    if (trimmed === loc.prefix || trimmed.startsWith(loc.prefix + "/")) {
      return {
        locale: loc,
        pathWithoutLocale: "/" + trimmed.slice(loc.prefix.length).replace(/^\/+/, ""),
      };
    }
  }
  return { locale: CLIENT_LOCALES[0], pathWithoutLocale: path };
}

// Build a path under the given locale prefix. The English locale has an
// empty prefix and lives at the URL root.
export function withLocalePrefix(prefix: string, path: string): string {
  if (!prefix) return path;
  const clean = path.startsWith("/") ? path : "/" + path;
  return `/${prefix}${clean}`;
}

// Prefix `target` with the locale derived from `currentPath` so internal
// navigation keeps the visitor inside the language they picked. Returns
// `target` unchanged when:
//   - it isn't an absolute app path (external URL, anchor, query-only),
//   - the active locale is English (no prefix),
//   - `target` already carries a locale prefix, or
//   - `target` doesn't correspond to a localizable route (e.g. /login, /admin).
export function localizeHref(currentPath: string, target: string): string {
  if (!target.startsWith("/")) return target;
  const { locale } = splitLocaleFromPath(currentPath);
  if (!locale.prefix) return target;
  const [pathOnly] = target.split(/[?#]/);
  const { locale: targetLocale, pathWithoutLocale } = splitLocaleFromPath(pathOnly);
  if (targetLocale.prefix) return target;
  if (!isLocalizablePath(pathWithoutLocale)) return target;
  return withLocalePrefix(locale.prefix, target);
}

// Hook variant for components: returns a stable-ish helper that prefixes
// internal hrefs with the current locale. Use everywhere internal navigation
// happens (sidebar, header, page links, programmatic navigate calls).
export function useLocalizedHref(): (path: string) => string {
  const [location] = useLocation();
  return (path: string) => localizeHref(location, path);
}

// Swap (or remove) the locale prefix on a path while preserving the rest.
// Used by the header language switcher to rewrite the current URL when the
// visitor picks a different language.
export function swapLocaleOnPath(path: string, target: ClientLocale): string {
  const { pathWithoutLocale } = splitLocaleFromPath(path);
  return withLocalePrefix(target.prefix, pathWithoutLocale);
}

// Single source of truth for which routes have localized counterparts.
// App.tsx imports this list to register the prefixed routes, and the
// `isLocalizablePath` check below derives its allowed first-segment set
// from the same data — so the route table and the switcher guard can
// never drift apart. Authenticated/admin routes (e.g. /login, /admin,
// /reset-password) are intentionally absent.
export const LOCALIZED_PATHS = [
  "/",
  "/car/:slug",
  "/part/:partNumberClean",
  "/search",
  "/part-finder",
  "/vin",
  "/vin/:vin",
  "/servicing",
  "/servicing/:vin",
  "/models",
  "/my-cars",
  "/series/:seriesSlug",
  "/chassis/:chassisCode",
  "/about",
  "/recommended-sites",
] as const;

const LOCALIZED_FIRST_SEGMENTS: ReadonlySet<string> = new Set(
  LOCALIZED_PATHS.map(p => p.replace(/^\/+/, "").split("/")[0]),
);

// Returns true when the given path corresponds to a page that exists under
// every locale prefix. Pass paths *without* a locale prefix (use
// `splitLocaleFromPath` first if needed).
export function isLocalizablePath(pathWithoutLocale: string): boolean {
  const trimmed = pathWithoutLocale.replace(/^\/+/, "");
  const firstSegment = trimmed.split("/")[0] ?? "";
  return LOCALIZED_FIRST_SEGMENTS.has(firstSegment);
}

// Returns true when the app is being served from the bmv.vin vanity host.
// Safe to call during SSR (returns false server-side).
export function isBmvVinHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "bmv.vin" || h === "www.bmv.vin";
}

// localStorage key for the visitor's chosen language. Read on first paint to
// auto-redirect returning visitors and written every time they pick a new
// locale from the header switcher.
export const LOCALE_STORAGE_KEY = "bmv.locale";

export function getStoredLocale(): ClientLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const code = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!code) return null;
    return CLIENT_LOCALES.find(l => l.code === code) ?? null;
  } catch {
    return null;
  }
}

export function storeLocale(loc: ClientLocale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, loc.code);
  } catch {
    // Ignore quota/private-mode failures — preference just won't persist.
  }
}

// Best-effort browser language detection used for first-time visitors. We
// honour `navigator.languages` order and fall back to the primary subtag
// (e.g. "fr-CA" -> "fr-FR") so a French Canadian still lands on French.
export function detectBrowserLocale(): ClientLocale | null {
  if (typeof navigator === "undefined") return null;
  const langs: readonly string[] = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
  for (const raw of langs) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    const exact = CLIENT_LOCALES.find(l => l.code.toLowerCase() === lower);
    if (exact) return exact;
  }
  for (const raw of langs) {
    if (!raw) continue;
    const primary = raw.toLowerCase().split("-")[0];
    const match = CLIENT_LOCALES.find(l => {
      const lc = l.code.toLowerCase();
      return lc === primary || lc.startsWith(primary + "-");
    });
    if (match) return match;
  }
  return null;
}
