// Aggregator for the multilingual SEO content packs. Importing from
// `@shared/i18n` (or relative `../shared/i18n`) yields the locale list,
// resolution helpers, and a getPack(locale) lookup used by the server SEO
// generator and the admin SEO panel.

import type { LocaleCode, LocalePack } from "./types";
import { enPack } from "./en";
import { deDEPack } from "./de-DE";
import { frFRPack } from "./fr-FR";
import { esESPack } from "./es-ES";
import { itITPack } from "./it-IT";
import { zhCNPack } from "./zh-CN";
import { koKRPack } from "./ko-KR";
import { esMXPack } from "./es-MX";
import { enZAPack } from "./en-ZA";
import { ptBRPack } from "./pt-BR";
import { ruRUPack } from "./ru-RU";

// Importing for side effects: attaches authored vinHost strings to every
// non-English locale pack so getVinHostStrings() never falls back to
// English (Task #98).
import "./vin-host-locales";

export * from "./types";

export const PACKS: Record<LocaleCode, LocalePack> = {
  en: enPack,
  "de-DE": deDEPack,
  "fr-FR": frFRPack,
  "es-ES": esESPack,
  "it-IT": itITPack,
  "zh-CN": zhCNPack,
  "ko-KR": koKRPack,
  "es-MX": esMXPack,
  "en-ZA": enZAPack,
  "pt-BR": ptBRPack,
  "ru-RU": ruRUPack,
};

export function getPack(locale: LocaleCode | string | null | undefined): LocalePack {
  if (locale && (locale in PACKS)) return PACKS[locale as LocaleCode];
  return enPack;
}

export const LOCALE_LIST: { code: LocaleCode; prefix: string; nativeLabel: string; bcp47: string }[] =
  (Object.values(PACKS) as LocalePack[]).map(p => ({
    code: p.meta.code,
    prefix: p.meta.prefix,
    nativeLabel: p.meta.nativeLabel,
    bcp47: p.meta.bcp47,
  }));
