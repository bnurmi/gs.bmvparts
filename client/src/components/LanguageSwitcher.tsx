import { useLocation } from "wouter";
import { Check, Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CLIENT_LOCALES,
  type ClientLocale,
  isLocalizablePath,
  splitLocaleFromPath,
  storeLocale,
  swapLocaleOnPath,
} from "@/lib/locale";
import { useT } from "@/lib/i18n";

export function LanguageSwitcher() {
  const t = useT();
  const [location, navigate] = useLocation();
  const { locale: active } = splitLocaleFromPath(location);

  const { pathWithoutLocale } = splitLocaleFromPath(location);
  const canSwitchHere = isLocalizablePath(pathWithoutLocale);

  const handleSelect = (loc: ClientLocale) => {
    storeLocale(loc);
    if (loc.code === active.code) return;
    if (!canSwitchHere) return;
    navigate(swapLocaleOnPath(location, loc));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
        data-testid="button-language-switcher"
        aria-label={t.languageSwitcher.aria}
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{active.nativeLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {CLIENT_LOCALES.map(loc => {
          const isActive = loc.code === active.code;
          return (
            <DropdownMenuItem
              key={loc.code}
              onSelect={() => handleSelect(loc)}
              data-testid={`menu-locale-${loc.prefix || "en"}`}
              className="flex items-center justify-between gap-2"
            >
              <span>{loc.nativeLabel}</span>
              {isActive && <Check className="w-3.5 h-3.5 text-muted-foreground" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
