// Public entry point for the client-side UI string lookup.
//
// `useT()` resolves the active locale from the URL prefix (the same
// helper that PartDetail / hub pages use for SEO) and returns the
// matching strings dictionary. Components access fields directly:
//   const t = useT();
//   <h1>{t.home.heading}</h1>
//
// `useLocaleStrings(locale)` is a non-hook variant for callers that
// already know the locale (e.g. memoized status maps).

import { useMemo } from "react";
import { useLocation } from "wouter";
import { splitLocaleFromPath } from "../locale";
import type { LocaleCode } from "@shared/i18n/types";
import type { UiStrings } from "./strings";
import { EN } from "./strings";
import { STRINGS } from "./locales";

export type { UiStrings } from "./strings";
export { EN } from "./strings";
export { STRINGS } from "./locales";

export function getStrings(locale: LocaleCode | string | null | undefined): UiStrings {
  if (locale && (locale in STRINGS)) return STRINGS[locale as LocaleCode];
  return EN;
}

export function useT(): UiStrings {
  const [location] = useLocation();
  return useMemo(() => {
    const { locale } = splitLocaleFromPath(location);
    return getStrings(locale.code);
  }, [location]);
}
